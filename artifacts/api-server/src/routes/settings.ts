import express, { Router } from "express";
import { db, pool, appSettingsTable, usersTable, categoriesTable, pointsTable, pointContactsTable, pointImagesTable, savedPointsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole, requireAuth, hashPassword } from "../lib/auth";
import { UpdateSettingsBody, ImportDataBody } from "@workspace/api-zod";
import {
  isDriveConfigured, generateAuthUrl, exchangeCodeForAccount,
  getDriveAccounts, saveDriveAccounts, getRedirectUri,
  isDriveEnabled, setDriveEnabled, uploadToDrive,
} from "../lib/google-drive";

// SQL qiymatni to'g'ri escape qilish
function sqlVal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// jsKey → sqlColumn mapping bilan INSERT yaratish
function insertRows(
  table: string,
  cols: Array<{ js: string; sql: string }>,
  rows: Record<string, unknown>[]
): string {
  if (!rows.length) return "";
  const colList = cols.map(c => `"${c.sql}"`).join(", ");
  const vals = rows.map(r => `(${cols.map(c => sqlVal(r[c.js])).join(", ")})`).join(",\n  ");
  return `INSERT INTO ${table} (${colList}) VALUES\n  ${vals};\n`;
}

const router = Router();

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string | null) {
  await db
    .insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
}

// GET /settings
router.get("/", requireAuth, async (_req, res) => {
  const [premiumEnabled, botToken, backupChatId, appName] = await Promise.all([
    getSetting("premiumEnabled"),
    getSetting("botToken"),
    getSetting("backupChatId"),
    getSetting("appName"),
  ]);

  res.json({
    premiumEnabled: premiumEnabled === "true",
    botToken,
    backupChatId,
    appName,
  });
});

// PATCH /settings
router.patch("/", requireRole("sudo"), async (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { premiumEnabled, botToken, backupChatId, appName } = parsed.data;

  if (premiumEnabled !== undefined) await setSetting("premiumEnabled", String(premiumEnabled));
  if (botToken !== undefined) await setSetting("botToken", botToken);
  if (backupChatId !== undefined) await setSetting("backupChatId", backupChatId);
  if (appName !== undefined) await setSetting("appName", appName);

  const [pe, bt, bcid, an] = await Promise.all([
    getSetting("premiumEnabled"),
    getSetting("botToken"),
    getSetting("backupChatId"),
    getSetting("appName"),
  ]);

  res.json({
    premiumEnabled: pe === "true",
    botToken: bt,
    backupChatId: bcid,
    appName: an,
  });
});

// GET /settings/export  — SQL dump sifatida yuklash
router.get("/export", requireRole("sudo"), async (_req, res) => {
  const [users, categories, points, contacts, images, settings] = await Promise.all([
    db.select().from(usersTable),
    db.select().from(categoriesTable),
    db.select().from(pointsTable),
    db.select().from(pointContactsTable),
    db.select().from(pointImagesTable),
    db.select().from(appSettingsTable),
  ]);

  const date = new Date().toISOString();
  let sql = `-- MapVizit SQL Backup\n-- Generated: ${date}\n-- PostgreSQL\n\n`;

  // FK tartibida tozalash
  sql += `TRUNCATE TABLE saved_points, point_contacts, point_images, points, categories, users, app_settings RESTART IDENTITY CASCADE;\n\n`;

  const C = (js: string, sql: string) => ({ js, sql });
  const same = (k: string) => C(k, k);

  sql += insertRows("categories", [
    same("id"), same("name"), same("icon"), same("color"),
    C("createdAt", "created_at"), C("updatedAt", "updated_at"),
  ], categories as any[]);
  sql += "\n";
  sql += insertRows("users", [
    same("id"), same("username"), same("name"),
    C("passwordHash", "password_hash"), same("role"),
    C("isPremium", "is_premium"), C("assignedPointId", "assigned_point_id"),
    C("createdAt", "created_at"), C("updatedAt", "updated_at"),
  ], users as any[]);
  sql += "\n";
  sql += insertRows("points", [
    same("id"), same("name"), same("description"), same("lat"), same("lng"),
    C("categoryId", "category_id"), C("adminId", "admin_id"),
    C("vizitkaCode", "vizitka_code"),
    C("createdAt", "created_at"), C("updatedAt", "updated_at"),
  ], points as any[]);
  sql += "\n";
  sql += insertRows("point_contacts", [
    same("id"), C("pointId", "point_id"), same("type"), same("value"), same("label"),
    C("createdAt", "created_at"),
  ], contacts as any[]);
  sql += "\n";
  sql += insertRows("point_images", [
    same("id"), C("pointId", "point_id"), same("url"), same("caption"),
    C("createdAt", "created_at"),
  ], images as any[]);
  sql += "\n";
  sql += insertRows("app_settings", [
    same("key"), same("value"), C("updatedAt", "updated_at"),
  ], settings.map(s => ({ key: s.key, value: s.value, updatedAt: s.updatedAt })) as any[]);
  sql += "\n";

  // Sequence'larni yangilash
  sql += `-- Sequence'larni yangilash\n`;
  sql += `SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE(MAX(id), 1)) FROM categories;\n`;
  sql += `SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users;\n`;
  sql += `SELECT setval(pg_get_serial_sequence('points', 'id'), COALESCE(MAX(id), 1)) FROM points;\n`;
  sql += `SELECT setval(pg_get_serial_sequence('point_contacts', 'id'), COALESCE(MAX(id), 1)) FROM point_contacts;\n`;
  sql += `SELECT setval(pg_get_serial_sequence('point_images', 'id'), COALESCE(MAX(id), 1)) FROM point_images;\n`;

  const filename = `mapvizit-backup-${date.split("T")[0]}.sql`;
  res.setHeader("Content-Type", "application/sql; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(sql);
});

// POST /settings/import-sql  — SQL dump'ni import qilish
router.post("/import-sql", requireRole("sudo"), express.text({ type: "*/*", limit: "50mb" }), async (req, res) => {
  const sqlContent = req.body as string;
  if (!sqlContent || typeof sqlContent !== "string") {
    res.status(400).json({ error: "SQL fayl bo'sh yoki noto'g'ri" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sqlContent);
    await client.query("COMMIT");
    res.json({ success: true, message: "SQL import muvaffaqiyatli" });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// POST /settings/import  — OVERWRITE: eski ma'lumotlarni o'chirib, yangisini yozadi
router.post("/import", requireRole("sudo"), async (req, res) => {
  const parsed = ImportDataBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const backup = parsed.data as any;
  let imported = { users: 0, categories: 0, points: 0 };

  try {
    // 1) Eski barcha ma'lumotlarni FK tartibida o'chirish
    await db.delete(savedPointsTable);
    await db.delete(pointContactsTable);
    await db.delete(pointImagesTable);
    await db.delete(pointsTable);
    await db.delete(categoriesTable);
    await db.delete(usersTable);
    // Settings ni alohida o'chirmaymiz — quyida upsert qilamiz

    // 2) Yangi ma'lumotlarni yozish

    // Categories
    if (backup.categories?.length) {
      for (const cat of backup.categories) {
        const { createdAt: _c, updatedAt: _u, ...rest } = cat;
        await db.insert(categoriesTable).values(rest);
      }
      imported.categories = backup.categories.length;
    }

    // Users
    if (backup.users?.length) {
      for (const user of backup.users) {
        const { createdAt: _c, updatedAt: _u, ...rest } = user;
        await db.insert(usersTable).values(rest);
      }
      imported.users = backup.users.length;
    }

    // Points
    if (backup.points?.length) {
      for (const point of backup.points) {
        const { createdAt: _c, updatedAt: _u, ...rest } = point;
        await db.insert(pointsTable).values(rest);
      }
      imported.points = backup.points.length;
    }

    // Contacts
    if (backup.contacts?.length) {
      for (const contact of backup.contacts) {
        const { createdAt: _c, ...rest } = contact;
        await db.insert(pointContactsTable).values(rest);
      }
    }

    // Images
    if (backup.images?.length) {
      for (const image of backup.images) {
        const { createdAt: _c, ...rest } = image;
        await db.insert(pointImagesTable).values(rest);
      }
    }

    // Settings (upsert — sequence'ga ta'sir qilmasligi uchun o'chirmaymiz)
    if (backup.settings?.length) {
      for (const setting of backup.settings) {
        const { id: _id, updatedAt: _u, ...rest } = setting;
        await db.insert(appSettingsTable).values(rest)
          .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: rest.value } });
      }
    }

    res.json({ success: true, message: "Import successful", imported });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /settings/drive/status
router.get("/drive/status", requireRole("sudo"), async (_req, res) => {
  const configured = isDriveConfigured();
  const accounts = configured ? await getDriveAccounts() : [];
  const redirectUri = getRedirectUri();
  const enabledRaw = await getSetting("driveEnabled");
  const enabled = enabledRaw === "true";

  // Uploads papkasidagi lokalrasm sonini hisoblaymiz
  const { default: fs } = await import("fs");
  const { default: path } = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uploadsDir = path.join(__dirname, "..", "uploads");
  let localImagesCount = 0;
  try {
    const files = fs.readdirSync(uploadsDir);
    localImagesCount = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f)).length;
  } catch { /* papka yo'q */ }

  res.json({
    configured,
    enabled,
    redirectUri,
    localImagesCount,
    accounts: accounts.map(a => ({
      id: a.id,
      email: a.email,
      bytesUsed: a.bytesUsed,
      addedAt: a.addedAt,
      isFull: a.bytesUsed >= 14.5 * 1024 * 1024 * 1024,
    })),
  });
});

// PATCH /settings/drive/enabled
router.patch("/drive/enabled", requireRole("sudo"), async (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== "boolean") { res.status(400).json({ error: "enabled boolean kerak" }); return; }
  await setDriveEnabled(enabled);
  res.json({ enabled });
});

// POST /settings/drive/migrate  — uploads papkasidagi rasmlarni Drive ga ko'chirish
router.post("/drive/migrate", requireRole("sudo"), async (req, res) => {
  const driveReady = await isDriveEnabled();
  if (!driveReady) { res.status(400).json({ error: "Drive yoqilmagan yoki akkaunt yo'q" }); return; }

  const { default: fs } = await import("fs");
  const { default: path } = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uploadsDir = path.join(__dirname, "..", "uploads");

  // DB da /api/uploads/ bilan boshlangan barcha rasmlarni topamiz
  const localImages = await db.select().from(pointImagesTable)
    .then(rows => rows.filter(r => r.url?.startsWith("/api/uploads/")));

  let migrated = 0, failed = 0;
  const errors: string[] = [];

  for (const img of localImages) {
    const filename = img.url.replace("/api/uploads/", "");
    const filepath = path.join(uploadsDir, filename);
    try {
      if (!fs.existsSync(filepath)) {
        errors.push(`Fayl topilmadi: ${filename}`);
        failed++;
        continue;
      }
      const buffer = fs.readFileSync(filepath);
      const ext = path.extname(filename).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
      };
      const mimeType = mimeMap[ext] ?? "image/jpeg";
      const driveUrl = await uploadToDrive(buffer, filename, mimeType);
      if (!driveUrl) { errors.push(`Drive to'ldi: ${filename}`); failed++; continue; }

      await db.update(pointImagesTable).set({ url: driveUrl }).where(eq(pointImagesTable.id, img.id));
      migrated++;
    } catch (e: any) {
      errors.push(`${filename}: ${e.message}`);
      failed++;
    }
  }

  res.json({ total: localImages.length, migrated, failed, errors: errors.slice(0, 10) });
});

// POST /settings/drive/fix-urls  — uc?export=view → thumbnail formatiga o'tkazish
router.post("/drive/fix-urls", requireRole("sudo"), async (_req, res) => {
  const allImages = await db.select().from(pointImagesTable);
  const driveImages = allImages.filter(r =>
    r.url?.includes("drive.google.com")
  );
  let fixed = 0;
  for (const img of driveImages) {
    const match = img.url?.match(/[?&]id=([^&]+)/) || img.url?.match(/\/d\/([^/?&]+)/);
    if (!match) continue;
    const fileId = match[1];
    const newUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    if (img.url === newUrl) continue;
    await db.update(pointImagesTable).set({ url: newUrl }).where(eq(pointImagesTable.id, img.id));
    fixed++;
  }
  res.json({ total: driveImages.length, fixed });
});

// GET /settings/drive/auth-url
router.get("/drive/auth-url", requireRole("sudo"), async (_req, res) => {
  try {
    const url = generateAuthUrl();
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /settings/drive/callback  (Google redirects here after OAuth)
router.get("/drive/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error || !code) {
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2 style="color:#ef4444">❌ Xato yuz berdi</h2>
      <p>${error ?? "Kod olinmadi"}</p>
      <p>Bu tabni yopib qayta urinib ko'ring.</p>
    </body></html>`);
    return;
  }

  try {
    const account = await exchangeCodeForAccount(code);
    const accounts = await getDriveAccounts();
    const existing = accounts.findIndex(a => a.email === account.email);
    if (existing >= 0) {
      accounts[existing] = account;
    } else {
      accounts.push(account);
    }
    await saveDriveAccounts(accounts);
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
      <h2 style="color:#22c55e">✅ Muvaffaqiyatli qo'shildi!</h2>
      <p style="color:#a1a1aa">${account.email}</p>
      <p style="color:#a1a1aa">Bu tabni yopib sudo paneliga qayting.</p>
      <script>setTimeout(()=>window.close(),3000)</script>
    </body></html>`);
  } catch (err: any) {
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#fff">
      <h2 style="color:#ef4444">❌ Xato</h2>
      <p style="color:#a1a1aa">${err.message}</p>
      <p style="color:#a1a1aa">Bu tabni yoping.</p>
    </body></html>`);
  }
});

// DELETE /settings/drive/accounts/:id
router.delete("/drive/accounts/:id", requireRole("sudo"), async (req, res) => {
  const { id } = req.params;
  const accounts = await getDriveAccounts();
  const updated = accounts.filter(a => a.id !== id);
  await saveDriveAccounts(updated);
  res.json({ success: true });
});

export default router;

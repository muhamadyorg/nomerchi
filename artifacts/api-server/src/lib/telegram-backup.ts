import { db, usersTable, categoriesTable, pointsTable, pointContactsTable, pointImagesTable, appSettingsTable } from "@workspace/db";
import { logger } from "./logger";

let backupInterval: NodeJS.Timeout | null = null;

async function getSettingValue(key: string): Promise<string | null> {
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

function sqlVal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertRows(
  table: string,
  cols: Array<{ js: string; sql: string }>,
  rows: Record<string, unknown>[]
): string {
  if (!rows.length) return "";
  const C = (js: string, sql: string) => ({ js, sql });
  const colList = cols.map(c => `"${c.sql}"`).join(", ");
  const vals = rows.map(r => `(${cols.map(c => sqlVal(r[c.js])).join(", ")})`).join(",\n  ");
  return `INSERT INTO ${table} (${colList}) VALUES\n  ${vals};\n`;
}

function generateSql(data: {
  users: any[];
  categories: any[];
  points: any[];
  contacts: any[];
  images: any[];
  settings: any[];
}): string {
  const { users, categories, points, contacts, images, settings } = data;
  const date = new Date().toISOString();
  const C = (js: string, sql: string) => ({ js, sql });
  const same = (k: string) => C(k, k);

  let sql = `-- MapVizit SQL Backup\n-- Generated: ${date}\n-- PostgreSQL\n\n`;
  sql += `TRUNCATE TABLE saved_points, point_contacts, point_images, points, categories, users, app_settings RESTART IDENTITY CASCADE;\n\n`;

  sql += insertRows("categories", [
    same("id"), same("name"), same("icon"), same("color"),
    C("createdAt", "created_at"), C("updatedAt", "updated_at"),
  ], categories);
  sql += "\n";
  sql += insertRows("users", [
    same("id"), same("username"), same("name"),
    C("passwordHash", "password_hash"), same("role"),
    C("isPremium", "is_premium"), C("assignedPointId", "assigned_point_id"),
    C("createdAt", "created_at"), C("updatedAt", "updated_at"),
  ], users);
  sql += "\n";
  sql += insertRows("points", [
    same("id"), same("name"), same("description"), same("lat"), same("lng"),
    C("categoryId", "category_id"), C("adminId", "admin_id"),
    C("vizitkaCode", "vizitka_code"),
    C("createdAt", "created_at"), C("updatedAt", "updated_at"),
  ], points);
  sql += "\n";
  sql += insertRows("point_contacts", [
    same("id"), C("pointId", "point_id"), same("type"), same("value"), same("label"),
    C("createdAt", "created_at"),
  ], contacts);
  sql += "\n";
  sql += insertRows("point_images", [
    same("id"), C("pointId", "point_id"), same("url"), same("caption"),
    C("createdAt", "created_at"),
  ], images);
  sql += "\n";
  sql += insertRows("app_settings", [
    same("key"), same("value"), C("updatedAt", "updated_at"),
  ], settings.map(s => ({ key: s.key, value: s.value, updatedAt: s.updatedAt })));
  sql += "\n";

  sql += `-- Sequence'larni yangilash\n`;
  sql += `SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE(MAX(id), 1)) FROM categories;\n`;
  sql += `SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users;\n`;
  sql += `SELECT setval(pg_get_serial_sequence('points', 'id'), COALESCE(MAX(id), 1)) FROM points;\n`;
  sql += `SELECT setval(pg_get_serial_sequence('point_contacts', 'id'), COALESCE(MAX(id), 1)) FROM point_contacts;\n`;
  sql += `SELECT setval(pg_get_serial_sequence('point_images', 'id'), COALESCE(MAX(id), 1)) FROM point_images;\n`;

  return sql;
}

async function sendBackupToTelegram(botToken: string, chatId: string) {
  try {
    const [users, categories, points, contacts, images, settings] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(categoriesTable),
      db.select().from(pointsTable),
      db.select().from(pointContactsTable),
      db.select().from(pointImagesTable),
      db.select().from(appSettingsTable),
    ]);

    const sqlContent = generateSql({ users, categories, points, contacts, images, settings });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `mapvizit-backup-${timestamp}.sql`;

    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("caption", `📦 MapVizit SQL backup — ${new Date().toLocaleString("uz-UZ")}`);
    formData.append("document", new Blob([sqlContent], { type: "application/sql" }), filename);

    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: "POST",
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.text();
      logger.warn({ err }, "Telegram backup failed");
    } else {
      logger.info("Telegram SQL backup sent successfully");
    }
  } catch (err) {
    logger.error({ err }, "Error sending Telegram backup");
  }
}

export async function startBackupScheduler() {
  if (backupInterval) {
    clearInterval(backupInterval);
  }

  backupInterval = setInterval(async () => {
    try {
      const botToken = await getSettingValue("botToken");
      const backupChatId = await getSettingValue("backupChatId");
      if (botToken && backupChatId) {
        await sendBackupToTelegram(botToken, backupChatId);
      }
    } catch (err) {
      logger.error({ err }, "Backup scheduler error");
    }
  }, 60 * 1000);

  logger.info("Backup scheduler started");
}

export function stopBackupScheduler() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}

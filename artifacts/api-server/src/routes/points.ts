import { Router } from "express";
import { db, pointsTable, pointContactsTable, pointImagesTable, categoriesTable, savedPointsTable, usersTable } from "@workspace/db";
import { eq, ilike, or, and } from "drizzle-orm";
import { requireAuth, requireRole, optionalAuth } from "../lib/auth";
import {
  CreatePointBody,
  UpdatePointBody,
  AddPointImageBody,
  AddPointContactBody,
  AssignAdminToPointBody,
} from "@workspace/api-zod";
import { generateVizitkaCode } from "../lib/vizitka";
import { uploadToDrive, getDriveAccounts } from "../lib/google-drive";

const router = Router();

async function buildPoint(point: any, userId?: number) {
  const [contacts, images, category] = await Promise.all([
    db.select().from(pointContactsTable).where(eq(pointContactsTable.pointId, point.id)),
    db.select().from(pointImagesTable).where(eq(pointImagesTable.pointId, point.id)),
    point.categoryId
      ? db.select().from(categoriesTable).where(eq(categoriesTable.id, point.categoryId)).limit(1).then(r => r[0])
      : Promise.resolve(null),
  ]);

  let isSaved = false;
  if (userId) {
    const [saved] = await db
      .select()
      .from(savedPointsTable)
      .where(and(eq(savedPointsTable.userId, userId), eq(savedPointsTable.pointId, point.id)))
      .limit(1);
    isSaved = !!saved;
  }

  return {
    ...point,
    contacts,
    images,
    category: category ?? null,
    isSaved,
  };
}

// GET /points/stats - must be before /:id
router.get("/stats", requireAuth, async (_req, res) => {
  const points = await db.select().from(pointsTable);
  const cats = await db.select().from(categoriesTable);

  const byCategory = cats.map(cat => ({
    categoryName: cat.name,
    count: points.filter(p => p.categoryId === cat.id).length,
  }));

  const uncategorized = points.filter(p => !p.categoryId).length;
  if (uncategorized > 0) {
    byCategory.push({ categoryName: "Kategoriyasiz", count: uncategorized });
  }

  res.json({ total: points.length, byCategory });
});

// GET /points
router.get("/", optionalAuth, async (req, res) => {
  const { search, categoryId } = req.query as { search?: string; categoryId?: string };

  let allPoints = await db.select().from(pointsTable);

  if (categoryId) {
    const cid = parseInt(categoryId);
    allPoints = allPoints.filter(p => p.categoryId === cid);
  }

  if (search) {
    const q = search.toLowerCase();
    // Fetch categories for fuzzy search on category name
    const cats = await db.select().from(categoriesTable);
    const catMap = new Map(cats.map(c => [c.id, c]));

    allPoints = allPoints.filter(p => {
      const cat = p.categoryId ? catMap.get(p.categoryId) : null;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (cat && cat.name.toLowerCase().includes(q))
      );
    });
  }

  const result = await Promise.all(allPoints.map(p => buildPoint(p, req.userId)));
  res.json(result);
});

// POST /points
router.post("/", requireRole("sudo"), async (req, res) => {
  const parsed = CreatePointBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  let code = generateVizitkaCode();
  // ensure uniqueness
  let existing = await db.select().from(pointsTable).where(eq(pointsTable.vizitkaCode, code)).limit(1);
  while (existing.length > 0) {
    code = generateVizitkaCode();
    existing = await db.select().from(pointsTable).where(eq(pointsTable.vizitkaCode, code)).limit(1);
  }

  const [created] = await db.insert(pointsTable).values({ ...parsed.data, vizitkaCode: code }).returning();
  const full = await buildPoint(created);
  res.status(201).json(full);
});

// GET /points/:id
router.get("/:id", optionalAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [point] = await db.select().from(pointsTable).where(eq(pointsTable.id, id)).limit(1);
  if (!point) { res.status(404).json({ error: "Not found" }); return; }

  res.json(await buildPoint(point, req.userId));
});

// PATCH /points/:id
router.patch("/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // sudo can edit all; admin can only edit their assigned point
  if (req.userRole === "admin") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user || user.assignedPointId !== id) {
      res.status(403).json({ error: "Forbidden: not your point" });
      return;
    }
    // Admin cannot change lat/lng
    const { lat: _lat, lng: _lng, ...rest } = req.body;
    req.body = rest;
  } else if (req.userRole !== "sudo") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdatePointBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [updated] = await db.update(pointsTable).set(parsed.data).where(eq(pointsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  res.json(await buildPoint(updated, req.userId));
});

// DELETE /points/:id
router.delete("/:id", requireRole("sudo"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(pointContactsTable).where(eq(pointContactsTable.pointId, id));
  await db.delete(pointImagesTable).where(eq(pointImagesTable.pointId, id));
  await db.delete(savedPointsTable).where(eq(savedPointsTable.pointId, id));
  await db.delete(pointsTable).where(eq(pointsTable.id, id));
  res.json({ ok: true });
});

// POST /points/:id/images
router.post("/:id/images", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const canEdit = req.userRole === "sudo" || (req.userRole === "admin" && await isAdminOfPoint(req.userId!, id));
  if (!canEdit) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = AddPointImageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [created] = await db.insert(pointImagesTable).values({ ...parsed.data, pointId: id }).returning();
  res.status(201).json(created);
});

// POST /points/:id/images/upload  — multipart file upload (Drive yoki disk)
router.post("/:id/images/upload", requireAuth, async (req, res) => {
  const { default: multer } = await import("multer");
  const { default: path } = await import("path");
  const { fileURLToPath } = await import("url");
  const { default: fs } = await import("fs");
  const { default: crypto } = await import("crypto");

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const canEdit = req.userRole === "sudo" || (req.userRole === "admin" && await isAdminOfPoint(req.userId!, id));
  if (!canEdit) { res.status(403).json({ error: "Forbidden" }); return; }

  // Drive mavjudligini tekshiramiz
  const driveAccounts = await getDriveAccounts();
  const driveAvailable = driveAccounts.some(a => a.bytesUsed < 14.5 * 1024 * 1024 * 1024);

  const storage = driveAvailable
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (() => {
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          const uploadsDir = path.join(__dirname, "..", "uploads");
          fs.mkdirSync(uploadsDir, { recursive: true });
          return uploadsDir;
        })(),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || ".webp";
          cb(null, `img_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`);
        },
      });

  const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) cb(null, true);
      else cb(new Error("Only image files allowed"));
    },
  }).single("image");

  upload(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    let url: string;

    if (driveAvailable && req.file.buffer) {
      // Google Drive ga upload
      const ext = path.extname(req.file.originalname) || ".webp";
      const filename = `img_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
      const driveUrl = await uploadToDrive(req.file.buffer, filename, req.file.mimetype);
      if (driveUrl) {
        url = driveUrl;
      } else {
        // Drive to'ldi — disk fallback
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const uploadsDir = path.join(__dirname, "..", "uploads");
        fs.mkdirSync(uploadsDir, { recursive: true });
        const filename2 = `img_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
        fs.writeFileSync(path.join(uploadsDir, filename2), req.file.buffer);
        url = `/api/uploads/${filename2}`;
      }
    } else {
      // Disk storage (Drive yo'q)
      url = `/api/uploads/${req.file.filename}`;
    }

    const [created] = await db.insert(pointImagesTable).values({ url, caption: null, pointId: id }).returning();
    res.status(201).json(created);
  });
});

// DELETE /points/:id/images/:imageId
router.delete("/:id/images/:imageId", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const imageId = parseInt(req.params.imageId);
  if (isNaN(id) || isNaN(imageId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const canEdit = req.userRole === "sudo" || (req.userRole === "admin" && await isAdminOfPoint(req.userId!, id));
  if (!canEdit) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(pointImagesTable).where(and(eq(pointImagesTable.id, imageId), eq(pointImagesTable.pointId, id)));
  res.json({ ok: true });
});

// POST /points/:id/contacts
router.post("/:id/contacts", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const canEdit = req.userRole === "sudo" || (req.userRole === "admin" && await isAdminOfPoint(req.userId!, id));
  if (!canEdit) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = AddPointContactBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [created] = await db.insert(pointContactsTable).values({ ...parsed.data, pointId: id }).returning();
  res.status(201).json(created);
});

// DELETE /points/:id/contacts/:contactId
router.delete("/:id/contacts/:contactId", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const contactId = parseInt(req.params.contactId);
  if (isNaN(id) || isNaN(contactId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const canEdit = req.userRole === "sudo" || (req.userRole === "admin" && await isAdminOfPoint(req.userId!, id));
  if (!canEdit) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(pointContactsTable).where(and(eq(pointContactsTable.id, contactId), eq(pointContactsTable.pointId, id)));
  res.json({ ok: true });
});

// POST /points/:id/assign-admin
router.post("/:id/assign-admin", requireRole("sudo"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = AssignAdminToPointBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { adminId } = parsed.data;

  // Update point
  const [updated] = await db.update(pointsTable).set({ adminId }).where(eq(pointsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // If assigning a user, update their assignedPointId and role
  if (adminId) {
    await db.update(usersTable)
      .set({ assignedPointId: id, role: "admin" })
      .where(eq(usersTable.id, adminId));
  }

  res.json(await buildPoint(updated));
});

async function isAdminOfPoint(userId: number, pointId: number): Promise<boolean> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user?.assignedPointId === pointId;
}

export default router;

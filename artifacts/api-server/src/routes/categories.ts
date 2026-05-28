import { Router } from "express";
import { db, categoriesTable, pointsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireRole, requireAuth } from "../lib/auth";
import { CreateCategoryBody, UpdateCategoryBody } from "@workspace/api-zod";

const router = Router();

// GET /categories
router.get("/", requireAuth, async (_req, res) => {
  const cats = await db.select().from(categoriesTable);
  const points = await db.select().from(pointsTable);

  const withCount = cats.map(cat => ({
    ...cat,
    pointCount: points.filter(p => p.categoryId === cat.id).length,
  }));

  res.json(withCount);
});

// POST /categories
router.post("/", requireRole("sudo"), async (req, res) => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [created] = await db.insert(categoriesTable).values(parsed.data).returning();
  res.status(201).json({ ...created, pointCount: 0 });
});

// PATCH /categories/:id
router.patch("/:id", requireRole("sudo"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [updated] = await db.update(categoriesTable).set(parsed.data).where(eq(categoriesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  const points = await db.select().from(pointsTable).where(eq(pointsTable.categoryId, id));
  res.json({ ...updated, pointCount: points.length });
});

// DELETE /categories/:id
router.delete("/:id", requireRole("sudo"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
  res.json({ ok: true });
});

export default router;

import { Router } from "express";
import { db, savedPointsTable, pointsTable, pointContactsTable, pointImagesTable, categoriesTable, usersTable, appSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

async function buildPoint(point: any, userId: number) {
  const [contacts, images, category] = await Promise.all([
    db.select().from(pointContactsTable).where(eq(pointContactsTable.pointId, point.id)),
    db.select().from(pointImagesTable).where(eq(pointImagesTable.pointId, point.id)),
    point.categoryId
      ? db.select().from(categoriesTable).where(eq(categoriesTable.id, point.categoryId)).limit(1).then(r => r[0])
      : Promise.resolve(null),
  ]);
  return { ...point, contacts, images, category: category ?? null, isSaved: true };
}

// GET /saved
router.get("/", requireAuth, async (req, res) => {
  const saved = await db.select().from(savedPointsTable).where(eq(savedPointsTable.userId, req.userId!));
  const pointIds = saved.map(s => s.pointId);

  if (pointIds.length === 0) {
    res.json([]);
    return;
  }

  const allPoints = await db.select().from(pointsTable);
  const myPoints = allPoints.filter(p => pointIds.includes(p.id));
  const result = await Promise.all(myPoints.map(p => buildPoint(p, req.userId!)));
  res.json(result);
});

// POST /saved/:pointId
router.post("/:pointId", requireAuth, async (req, res) => {
  const pointId = parseInt(req.params.pointId);
  if (isNaN(pointId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Premium limit tekshirish
  const [premiumSetting] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "premiumEnabled")).limit(1);
  const premiumEnabled = premiumSetting?.value === "true";

  if (premiumEnabled) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    const isFreeTier = user && user.role !== "sudo" && user.role !== "premium" && !user.isPremium;
    if (isFreeTier) {
      const existing = await db.select().from(savedPointsTable).where(eq(savedPointsTable.userId, req.userId!));
      if (existing.length >= 1) {
        res.status(403).json({ error: "premium_required", message: "Saqlab olish limiti 1 ta. Premium kerak." });
        return;
      }
    }
  }

  try {
    await db.insert(savedPointsTable).values({ userId: req.userId!, pointId }).onConflictDoNothing();
  } catch {
    // ignore duplicate
  }
  res.json({ ok: true });
});

// DELETE /saved/:pointId
router.delete("/:pointId", requireAuth, async (req, res) => {
  const pointId = parseInt(req.params.pointId);
  if (isNaN(pointId)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(savedPointsTable).where(
    and(eq(savedPointsTable.userId, req.userId!), eq(savedPointsTable.pointId, pointId))
  );
  res.json({ ok: true });
});

export default router;

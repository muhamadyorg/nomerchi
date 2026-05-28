import { Router } from "express";
import { db, pointsTable, pointContactsTable, pointImagesTable, categoriesTable, appSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

// GET /vizitka/:code — public, no auth required
router.get("/:code", async (req, res) => {
  const { code } = req.params;

  const [point] = await db.select().from(pointsTable).where(eq(pointsTable.vizitkaCode, code)).limit(1);
  if (!point) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Premium check: if premiumEnabled and point's admin doesn't have premium
  const premiumEnabled = await getSetting("premiumEnabled");
  let premiumRequired = false;

  if (premiumEnabled === "true" && point.adminId) {
    const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, point.adminId)).limit(1);
    const adminHasPremium = admin?.role === "sudo" || admin?.role === "premium" || !!admin?.isPremium;
    if (!adminHasPremium) {
      premiumRequired = true;
    }
  }

  if (premiumRequired) {
    res.json({ premiumRequired: true, pointName: point.name });
    return;
  }

  const [contacts, images, category] = await Promise.all([
    db.select().from(pointContactsTable).where(eq(pointContactsTable.pointId, point.id)),
    db.select().from(pointImagesTable).where(eq(pointImagesTable.pointId, point.id)),
    point.categoryId
      ? db.select().from(categoriesTable).where(eq(categoriesTable.id, point.categoryId)).limit(1).then(r => r[0])
      : Promise.resolve(null),
  ]);

  res.json({
    point: {
      ...point,
      contacts,
      images,
      category: category ?? null,
      isSaved: false,
    },
  });
});

export default router;

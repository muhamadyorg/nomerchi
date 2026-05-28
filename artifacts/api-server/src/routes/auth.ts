import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { signToken, comparePassword, hashPassword, requireAuth, getCurrentUser } from "../lib/auth";

const router = Router();

// POST /auth/login
router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { username, password } = parsed.data;
  const force = req.body.force === true;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  // Agar oldin login qilingan bo'lsa va force yo'q — ogohlantirish
  if (user.tokenVersion > 0 && !force) {
    res.status(409).json({
      requiresForce: true,
      message: "Bu hisob boshqa qurilmada ochiq. OK bosish orqali eski qurilmadan chiqiladi.",
    });
    return;
  }

  // tokenVersion oshiramiz — eski tokenlar bekor bo'ladi
  const newVersion = user.tokenVersion + 1;
  await db.update(usersTable).set({ tokenVersion: newVersion }).where(eq(usersTable.id, user.id));

  const token = signToken({ userId: user.id, role: user.role, tokenVersion: newVersion });
  const { passwordHash: _ph, tokenVersion: _tv, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// GET /auth/me
router.get("/me", requireAuth, async (req, res) => {
  const user = await getCurrentUser(req.userId!);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const { passwordHash: _ph, ...safeUser } = user;
  res.json(safeUser);
});

// POST /auth/logout
router.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

export default router;

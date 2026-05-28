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

  const token = signToken({ userId: user.id, role: user.role });
  const { passwordHash: _ph, ...safeUser } = user;
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

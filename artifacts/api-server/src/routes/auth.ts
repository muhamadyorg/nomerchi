import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { signToken, comparePassword, hashPassword, requireAuth, getCurrentUser, verifyToken } from "../lib/auth";
import { addConnection, removeConnection, kickUser } from "../lib/session-manager";

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

  // Eski qurilmani real-time chiqarish
  kickUser(user.id);

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

// GET /auth/session-events — SSE: real-time session invalidation
router.get("/session-events", (req, res) => {
  const token = req.query.token as string | undefined;
  if (!token) { res.status(401).end(); return; }
  let payload: { userId: number; tokenVersion: number } | null = null;
  try { payload = verifyToken(token) as any; } catch { res.status(401).end(); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Ping har 25 sekundda (proxy timeout oldini olish)
  res.write(": ping\n\n");
  const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25_000);

  const userId = payload.userId;
  addConnection(userId, res);

  req.on("close", () => {
    clearInterval(ping);
    removeConnection(userId, res);
  });
});

// POST /auth/logout
router.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

export default router;

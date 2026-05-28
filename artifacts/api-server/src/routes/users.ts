import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireRole, requireAuth } from "../lib/auth";
import { UpdateUserBody } from "@workspace/api-zod";
import bcrypt from "bcryptjs";

const router = Router();

function safeUser(user: any) {
  const { passwordHash: _ph, ...rest } = user;
  return rest;
}

const VALID_ROLES = ["sudo", "admin", "premium", "viewer"] as const;
type Role = (typeof VALID_ROLES)[number];

function parseCreateUserBody(body: any): { data: { username: string; name: string; password: string; phone: string | null; role: Role; isPremium: boolean; premiumExpiresAt: string | null }; error?: string } {
  if (!body || typeof body !== "object") return { data: null as any, error: "Invalid body" };
  const { username, name, password, phone, role, isPremium, premiumExpiresAt } = body;
  if (!username || typeof username !== "string" || username.length < 2) return { data: null as any, error: "username must be at least 2 chars" };
  if (!name || typeof name !== "string" || name.length < 1) return { data: null as any, error: "name required" };
  if (!password || typeof password !== "string" || password.length < 4) return { data: null as any, error: "password must be at least 4 chars" };
  const resolvedRole: Role = VALID_ROLES.includes(role) ? role : "viewer";
  return {
    data: {
      username: username.trim(),
      name: name.trim(),
      password,
      phone: phone && typeof phone === "string" ? phone.trim() : null,
      role: resolvedRole,
      isPremium: typeof isPremium === "boolean" ? isPremium : resolvedRole === "premium",
      premiumExpiresAt: premiumExpiresAt && typeof premiumExpiresAt === "string" ? premiumExpiresAt : null,
    }
  };
}

// GET /users/stats
router.get("/stats", requireRole("sudo"), async (_req, res) => {
  const [totalRow] = await db.select({ count: count() }).from(usersTable);
  const total = Number(totalRow?.count ?? 0);

  const allUsers = await db.select().from(usersTable);
  const sudoCount = allUsers.filter(u => u.role === "sudo").length;
  const adminsCount = allUsers.filter(u => u.role === "admin").length;
  const premiumCount = allUsers.filter(u => u.role === "premium" || u.isPremium).length;
  const viewersCount = allUsers.filter(u => u.role === "viewer" && !u.isPremium).length;

  res.json({ total, sudo: sudoCount, admins: adminsCount, premium: premiumCount, viewers: viewersCount });
});

// GET /users
router.get("/", requireRole("sudo"), async (req, res) => {
  const { role, search } = req.query as { role?: string; search?: string };

  let users = await db.select().from(usersTable);

  if (role) {
    users = users.filter(u => u.role === role);
  }
  if (search) {
    const q = search.toLowerCase();
    users = users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.phone && u.phone.includes(q))
    );
  }

  res.json(users.map(safeUser));
});

// POST /users — sudo creates a user
router.post("/", requireRole("sudo"), async (req, res) => {
  const { data, error } = parseCreateUserBody(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }

  const { username, name, password, phone, role, isPremium, premiumExpiresAt } = data;

  // Check unique username
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (existing) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [created] = await db.insert(usersTable).values({
    username,
    name,
    passwordHash,
    phone: phone ?? null,
    role,
    isPremium: isPremium || role === "premium",
    premiumExpiresAt: premiumExpiresAt ? new Date(premiumExpiresAt) : null,
  }).returning();

  res.status(201).json(safeUser(created));
});

// GET /users/:id
router.get("/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  if (req.userRole !== "sudo" && req.userId !== id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  res.json(safeUser(user));
});

// PATCH /users/:id
router.patch("/:id", requireRole("sudo"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const updates: any = { ...parsed.data };
  if (updates.premiumExpiresAt) {
    updates.premiumExpiresAt = new Date(updates.premiumExpiresAt);
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  res.json(safeUser(updated));
});

// DELETE /users/:id
router.delete("/:id", requireRole("sudo"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ ok: true });
});

export default router;

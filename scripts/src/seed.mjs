#!/usr/bin/env node
// Sudo foydalanuvchini yaratish (agar yo'q bo'lsa)
import pg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL kerak!"); process.exit(1); }

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

const SUDO_USER     = process.env.SEED_SUDO_USER     || "sudo";
const SUDO_PASS     = process.env.SEED_SUDO_PASSWORD  || "sudo123";
const SUDO_NAME     = process.env.SEED_SUDO_NAME      || "Sudo Admin";

// Tekshiramiz
const { rows } = await client.query("SELECT id FROM users WHERE username = $1", [SUDO_USER]);
if (rows.length > 0) {
  console.log(`✅ "${SUDO_USER}" foydalanuvchi allaqachon mavjud. Seed o'tkazib yuborildi.`);
  await client.end();
  process.exit(0);
}

const hash = await bcrypt.hash(SUDO_PASS, 10);
await client.query(
  `INSERT INTO users (username, password_hash, name, role, is_premium) VALUES ($1, $2, $3, 'sudo', false)`,
  [SUDO_USER, hash, SUDO_NAME]
);

console.log(`✅ Sudo foydalanuvchi yaratildi:`);
console.log(`   Username : ${SUDO_USER}`);
console.log(`   Parol    : ${SUDO_PASS}`);
console.log(`   Rol      : sudo`);

await client.end();

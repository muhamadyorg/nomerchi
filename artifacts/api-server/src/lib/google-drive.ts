import { google } from "googleapis";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Readable } from "stream";

const BYTES_LIMIT = 14.5 * 1024 * 1024 * 1024;

export interface DriveAccount {
  id: string;
  email: string;
  refreshToken: string;
  bytesUsed: number;
  addedAt: string;
}

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await db.insert(appSettingsTable).values({ key, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
}

export async function getDriveAccounts(): Promise<DriveAccount[]> {
  const raw = await getSetting("driveAccounts");
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function saveDriveAccounts(accounts: DriveAccount[]) {
  await setSetting("driveAccounts", JSON.stringify(accounts));
}

export function getRedirectUri(): string {
  const domains = process.env.REPLIT_DOMAINS || process.env.APP_DOMAIN;
  if (domains) return `https://${domains.split(",")[0].trim()}/api/settings/drive/callback`;
  return "http://localhost:80/api/settings/drive/callback";
}

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID yoki GOOGLE_CLIENT_SECRET o'rnatilmagan");
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Drive yoqilgan va kamida bitta bo'sh akkaunt bormi */
export async function isDriveEnabled(): Promise<boolean> {
  const enabled = await getSetting("driveEnabled");
  if (enabled !== "true") return false;
  const accounts = await getDriveAccounts();
  return accounts.some(a => a.bytesUsed < BYTES_LIMIT);
}

export async function setDriveEnabled(value: boolean) {
  await setSetting("driveEnabled", value ? "true" : "false");
}

export function generateAuthUrl(): string {
  const auth = createOAuth2Client();
  return auth.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "consent",
  });
}

export async function exchangeCodeForAccount(code: string): Promise<DriveAccount> {
  const auth = createOAuth2Client();
  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token) throw new Error("Refresh token olinmadi. Iltimos, qayta urinib ko'ring.");
  auth.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth });
  const { data } = await oauth2.userinfo.get();
  return {
    id: crypto.randomUUID(),
    email: data.email ?? "unknown@gmail.com",
    refreshToken: tokens.refresh_token,
    bytesUsed: 0,
    addedAt: new Date().toISOString(),
  };
}

export async function uploadToDrive(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string | null> {
  const accounts = await getDriveAccounts();
  const account = accounts.find(a => a.bytesUsed < BYTES_LIMIT);
  if (!account) return null;

  const auth = createOAuth2Client();
  auth.setCredentials({ refresh_token: account.refreshToken });
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.create({
    requestBody: { name: filename, mimeType },
    media: { mimeType, body: Readable.from(fileBuffer) },
    fields: "id,size",
  });

  const fileId = res.data.id!;
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  account.bytesUsed += parseInt(res.data.size ?? "0") || fileBuffer.length;
  await saveDriveAccounts(accounts);

  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

import { db, usersTable, categoriesTable, pointsTable, pointContactsTable, pointImagesTable, appSettingsTable } from "@workspace/db";
import { logger } from "./logger";

let backupInterval: NodeJS.Timeout | null = null;

async function getSettingValue(key: string): Promise<string | null> {
  const { eq } = await import("drizzle-orm");
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return row?.value ?? null;
}

async function sendBackupToTelegram(botToken: string, chatId: string) {
  try {
    const [users, categories, points, contacts, images, settings] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(categoriesTable),
      db.select().from(pointsTable),
      db.select().from(pointContactsTable),
      db.select().from(pointImagesTable),
      db.select().from(appSettingsTable),
    ]);

    const backup = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      users: users.map(u => ({ ...u, passwordHash: u.passwordHash })),
      categories,
      points,
      contacts,
      images,
      settings,
    };

    const json = JSON.stringify(backup, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `mapvizit-backup-${timestamp}.json`;

    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("caption", `MapVizit backup - ${new Date().toISOString()}`);
    formData.append("document", new Blob([json], { type: "application/json" }), filename);

    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: "POST",
      body: formData,
    });

    if (!resp.ok) {
      const err = await resp.text();
      logger.warn({ err }, "Telegram backup failed");
    } else {
      logger.info("Telegram backup sent successfully");
    }
  } catch (err) {
    logger.error({ err }, "Error sending Telegram backup");
  }
}

export async function startBackupScheduler() {
  if (backupInterval) {
    clearInterval(backupInterval);
  }

  backupInterval = setInterval(async () => {
    try {
      const botToken = await getSettingValue("botToken");
      const backupChatId = await getSettingValue("backupChatId");
      if (botToken && backupChatId) {
        await sendBackupToTelegram(botToken, backupChatId);
      }
    } catch (err) {
      logger.error({ err }, "Backup scheduler error");
    }
  }, 60 * 1000); // every minute

  logger.info("Backup scheduler started");
}

export function stopBackupScheduler() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}

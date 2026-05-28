import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const savedPointsTable = pgTable("saved_points", {
  userId: integer("user_id").notNull(),
  pointId: integer("point_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.pointId] })]);

export type SavedPoint = typeof savedPointsTable.$inferSelect;

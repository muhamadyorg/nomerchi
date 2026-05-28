import { pgTable, text, serial, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pointsTable = pgTable("points", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  vizitkaCode: text("vizitka_code").notNull().unique(),
  categoryId: integer("category_id"),
  adminId: integer("admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const pointContactsTable = pgTable("point_contacts", {
  id: serial("id").primaryKey(),
  pointId: integer("point_id").notNull(),
  type: text("type").notNull(), // phone | telegram | instagram | website
  value: text("value").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pointImagesTable = pgTable("point_images", {
  id: serial("id").primaryKey(),
  pointId: integer("point_id").notNull(),
  url: text("url").notNull(),
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPointSchema = createInsertSchema(pointsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertContactSchema = createInsertSchema(pointContactsTable).omit({ id: true, createdAt: true });
export const insertImageSchema = createInsertSchema(pointImagesTable).omit({ id: true, createdAt: true });

export type InsertPoint = z.infer<typeof insertPointSchema>;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type InsertImage = z.infer<typeof insertImageSchema>;
export type Point = typeof pointsTable.$inferSelect;
export type PointContact = typeof pointContactsTable.$inferSelect;
export type PointImage = typeof pointImagesTable.$inferSelect;

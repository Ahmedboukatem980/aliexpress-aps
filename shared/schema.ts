import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const savedPosts = pgTable("saved_posts", {
  id: serial("id").primaryKey(),
visibleId: text("visible_id").notNull(),
  title: text("title"),
  price: text("price"),
  link: text("link"),
  coupon: text("coupon"),
  image: text("image"),
  message: text("message"),
  hook: text("hook"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scheduledPosts = pgTable("scheduled_posts", {
  id: serial("id").primaryKey(),
  visibleId: text("visible_id").notNull(),
  title: text("title"),
  price: text("price"),
  link: text("link"),
  coupon: text("coupon"),
  image: text("image"),
  message: text("message"),
  scheduledTime: timestamp("scheduled_time").notNull(),
  credentials: jsonb("credentials"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SavedPost = typeof savedPosts.$inferSelect;
export type InsertSavedPost = typeof savedPosts.$inferInsert;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type InsertScheduledPost = typeof scheduledPosts.$inferInsert;

export const insertSavedPostSchema = createInsertSchema(savedPosts);
export const insertScheduledPostSchema = createInsertSchema(scheduledPosts);

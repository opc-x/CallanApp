import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appMeta = pgTable("app_meta", {
  id: text("id").primaryKey().default("default"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 单用户跨设备同步用：只有一行，靠 SYNC_CODE 环境变量当共享密钥，
// 不做账号系统。见 lib/progress-shared.ts 的 Progress 类型。
export const progress = pgTable("progress", {
  id: text("id").primaryKey().default("default"),
  done: jsonb("done").notNull().default([]),
  last: integer("last"),
  pos: jsonb("pos").notNull().default({}),
  saved: jsonb("saved").notNull().default([]),
  days: jsonb("days").notNull().default([]),
  savedWords: jsonb("saved_words").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

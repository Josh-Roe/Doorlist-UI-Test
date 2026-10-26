import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('doorlist_sessions', {
  id: text('id').primaryKey(),
  ciphertext: text('ciphertext').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const limits = sqliteTable('doorlist_auth_limits', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at').notNull(),
  lastAt: integer('last_at').notNull(),
  attempts: integer('attempts').notNull(),
});

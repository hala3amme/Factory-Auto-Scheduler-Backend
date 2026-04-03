import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const parts = pgTable('parts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Part = typeof parts.$inferSelect;
export type NewPart = typeof parts.$inferInsert;

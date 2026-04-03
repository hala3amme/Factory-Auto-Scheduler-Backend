import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

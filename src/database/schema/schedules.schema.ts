import { pgTable, uuid, date, timestamp } from 'drizzle-orm/pg-core';

export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date').unique().notNull(),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
});

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;

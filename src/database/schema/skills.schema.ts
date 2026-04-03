import { pgTable, uuid, text } from 'drizzle-orm/pg-core';

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').unique().notNull(),
});

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

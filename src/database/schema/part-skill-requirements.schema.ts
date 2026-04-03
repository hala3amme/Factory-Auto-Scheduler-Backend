import { pgTable, uuid, integer, primaryKey } from 'drizzle-orm/pg-core';
import { parts } from './parts.schema';
import { skills } from './skills.schema';

export const partSkillRequirements = pgTable(
  'part_skill_requirements',
  {
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    minutesPerUnit: integer('minutes_per_unit').notNull(),
  },
  (t) => [primaryKey({ columns: [t.partId, t.skillId] })],
);

export type PartSkillRequirement = typeof partSkillRequirements.$inferSelect;

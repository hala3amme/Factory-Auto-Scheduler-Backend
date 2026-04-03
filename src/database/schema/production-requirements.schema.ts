import { pgTable, uuid, date, integer } from 'drizzle-orm/pg-core';
import { unique } from 'drizzle-orm/pg-core';
import { parts } from './parts.schema';

export const productionRequirements = pgTable(
  'production_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: date('date').notNull(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
  },
  (t) => [unique().on(t.date, t.partId)],
);

export type ProductionRequirement = typeof productionRequirements.$inferSelect;
export type NewProductionRequirement =
  typeof productionRequirements.$inferInsert;

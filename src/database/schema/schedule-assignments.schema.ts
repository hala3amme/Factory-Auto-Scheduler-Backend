import { pgTable, uuid, integer, pgEnum, unique } from 'drizzle-orm/pg-core';
import { schedules } from './schedules.schema';
import { employees } from './employees.schema';
import { skills } from './skills.schema';

export const shiftEnum = pgEnum('shift', ['MORNING', 'SWING', 'NIGHT']);

export const scheduleAssignments = pgTable(
  'schedule_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => schedules.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    shift: shiftEnum('shift').notNull(),
    minutesAllocated: integer('minutes_allocated').notNull(),
  },
  (t) => [unique().on(t.scheduleId, t.employeeId)],
);

export type ScheduleAssignment = typeof scheduleAssignments.$inferSelect;
export type NewScheduleAssignment = typeof scheduleAssignments.$inferInsert;

import { pgTable, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { employees } from './employees.schema';
import { skills } from './skills.schema';

export const employeeSkills = pgTable(
  'employee_skills',
  {
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.skillId] })],
);

export type EmployeeSkill = typeof employeeSkills.$inferSelect;

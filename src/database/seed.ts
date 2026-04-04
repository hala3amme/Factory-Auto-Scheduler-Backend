/**
 * Demo seeder — run with: npm run db:seed
 *
 * Seeds a realistic factory scenario that exercises every feature of the
 * scheduler: multi-skill parts, multi-employee skill lanes, an inactive
 * employee (excluded from scheduling), and an unmet demand lane.
 *
 * Uses fixed UUIDs so the script is fully idempotent — safe to run multiple
 * times without duplicating data.
 *
 * Expected schedule output (run POST /generate-schedule for today):
 *   MORNING  Alice Chen      → Assembly     480 min
 *   MORNING  Bob Martinez    → Assembly     180 min   (fills remaining demand)
 *   MORNING  Dave Kim        → Welding      480 min
 *   MORNING  Eva Rodriguez   → Welding       20 min   (fills remaining demand)
 *   MORNING  Carol White     → Electronics  150 min
 *   Unmet    Painting        → 200 min      (Frank Turner is inactive)
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

// ─── Fixed UUIDs (stable across re-runs) ────────────────────────────────────

const SKILL_IDS = {
  assembly:    '11111111-0000-0000-0000-000000000001',
  electronics: '11111111-0000-0000-0000-000000000002',
  welding:     '11111111-0000-0000-0000-000000000003',
  painting:    '11111111-0000-0000-0000-000000000004',
};

const PART_IDS = {
  engine:    '22222222-0000-0000-0000-000000000001',
  bodyPanel: '22222222-0000-0000-0000-000000000002',
  gear:      '22222222-0000-0000-0000-000000000003',
};

const EMPLOYEE_IDS = {
  alice:  '33333333-0000-0000-0000-000000000001',
  bob:    '33333333-0000-0000-0000-000000000002',
  carol:  '33333333-0000-0000-0000-000000000003',
  dave:   '33333333-0000-0000-0000-000000000004',
  eva:    '33333333-0000-0000-0000-000000000005',
  frank:  '33333333-0000-0000-0000-000000000006',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function log(msg: string) {
  console.log(`  ${msg}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('\n🌱 Seeding demo data...\n');

  // ── Skills ────────────────────────────────────────────────────────────────
  console.log('📌 Skills');

  await db
    .insert(schema.skills)
    .values([
      { id: SKILL_IDS.assembly,    name: 'Assembly' },
      { id: SKILL_IDS.electronics, name: 'Electronics' },
      { id: SKILL_IDS.welding,     name: 'Welding' },
      { id: SKILL_IDS.painting,    name: 'Painting' },
    ])
    .onConflictDoNothing();

  log('Assembly, Electronics, Welding, Painting');

  // ── Parts ─────────────────────────────────────────────────────────────────
  console.log('\n🔩 Parts');

  await db
    .insert(schema.parts)
    .values([
      { id: PART_IDS.engine,    name: 'Engine' },
      { id: PART_IDS.bodyPanel, name: 'Body Panel' },
      { id: PART_IDS.gear,      name: 'Gear' },
    ])
    .onConflictDoNothing();

  // Engine: Assembly 30 min/unit + Electronics 15 min/unit
  // Body Panel: Welding 25 min/unit + Painting 10 min/unit
  // Gear: Assembly 12 min/unit
  await db
    .insert(schema.partSkillRequirements)
    .values([
      { partId: PART_IDS.engine,    skillId: SKILL_IDS.assembly,    minutesPerUnit: 30 },
      { partId: PART_IDS.engine,    skillId: SKILL_IDS.electronics, minutesPerUnit: 15 },
      { partId: PART_IDS.bodyPanel, skillId: SKILL_IDS.welding,     minutesPerUnit: 25 },
      { partId: PART_IDS.bodyPanel, skillId: SKILL_IDS.painting,    minutesPerUnit: 10 },
      { partId: PART_IDS.gear,      skillId: SKILL_IDS.assembly,    minutesPerUnit: 12 },
    ])
    .onConflictDoNothing();

  log('Engine         (Assembly 30 min/unit + Electronics 15 min/unit)');
  log('Body Panel     (Welding  25 min/unit + Painting    10 min/unit)');
  log('Gear           (Assembly 12 min/unit)');

  // ── Employees ─────────────────────────────────────────────────────────────
  console.log('\n👷 Employees');

  await db
    .insert(schema.employees)
    .values([
      { id: EMPLOYEE_IDS.alice, name: 'Alice Chen',      isActive: true  },
      { id: EMPLOYEE_IDS.bob,   name: 'Bob Martinez',    isActive: true  },
      { id: EMPLOYEE_IDS.carol, name: 'Carol White',     isActive: true  },
      { id: EMPLOYEE_IDS.dave,  name: 'Dave Kim',        isActive: true  },
      { id: EMPLOYEE_IDS.eva,   name: 'Eva Rodriguez',   isActive: true  },
      { id: EMPLOYEE_IDS.frank, name: 'Frank Turner',    isActive: false },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.employeeSkills)
    .values([
      { employeeId: EMPLOYEE_IDS.alice, skillId: SKILL_IDS.assembly    },
      { employeeId: EMPLOYEE_IDS.alice, skillId: SKILL_IDS.electronics },
      { employeeId: EMPLOYEE_IDS.bob,   skillId: SKILL_IDS.assembly    },
      { employeeId: EMPLOYEE_IDS.carol, skillId: SKILL_IDS.electronics },
      { employeeId: EMPLOYEE_IDS.dave,  skillId: SKILL_IDS.welding     },
      { employeeId: EMPLOYEE_IDS.eva,   skillId: SKILL_IDS.welding     },
      { employeeId: EMPLOYEE_IDS.eva,   skillId: SKILL_IDS.painting    },
      { employeeId: EMPLOYEE_IDS.frank, skillId: SKILL_IDS.painting    },
    ])
    .onConflictDoNothing();

  log('Alice Chen    — Assembly + Electronics         (active)');
  log('Bob Martinez  — Assembly                       (active)');
  log('Carol White   — Electronics                    (active)');
  log('Dave Kim      — Welding                        (active)');
  log('Eva Rodriguez — Welding + Painting             (active)');
  log('Frank Turner  — Painting                       (inactive ← excluded from schedule)');

  // ── Production requirements (today) ───────────────────────────────────────
  const date = today();
  console.log(`\n📋 Production Requirements  [${date}]`);

  // 10 Engines   → Assembly 300 min  + Electronics 150 min
  // 20 BodyPanels → Welding  500 min  + Painting    200 min
  // 30 Gears     → Assembly 360 min
  // ─────────────────────────────────────────────────────
  // Total demand → Assembly 660 min  (needs 2 employees)
  //                Electronics 150 min
  //                Welding 500 min   (needs 2 employees)
  //                Painting 200 min  ← UNMET (Frank inactive, Eva used for welding)
  await db
    .insert(schema.productionRequirements)
    .values([
      { date, partId: PART_IDS.engine,    quantity: 10 },
      { date, partId: PART_IDS.bodyPanel, quantity: 20 },
      { date, partId: PART_IDS.gear,      quantity: 30 },
    ])
    .onConflictDoUpdate({
      target: [schema.productionRequirements.date, schema.productionRequirements.partId],
      set: { quantity: sql`excluded.quantity` },
    });

  log('10 × Engine     → Assembly 300 min + Electronics 150 min');
  log('20 × Body Panel → Welding  500 min + Painting    200 min');
  log('30 × Gear       → Assembly 360 min');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Seed complete!

Run the scheduler for today:
  POST http://localhost:3000/generate-schedule
  Body: { "date": "${date}" }

Expected result:
  MORNING  Alice Chen      → Assembly      480 min
  MORNING  Bob Martinez    → Assembly      180 min
  MORNING  Dave Kim        → Welding       480 min
  MORNING  Eva Rodriguez   → Welding        20 min
  MORNING  Carol White     → Electronics   150 min
  Unmet    Painting        → 200 min  (Frank Turner is inactive)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/database/schema';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { DRIZZLE } from '../src/database/database.module';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function truncateAll(db: ReturnType<typeof drizzle>) {
  // Order matters: assignments → schedules → requirements → employee_skills →
  // part_skill_requirements → employees → parts → skills
  await db.delete(schema.scheduleAssignments);
  await db.delete(schema.schedules);
  await db.delete(schema.productionRequirements);
  await db.delete(schema.employeeSkills);
  await db.delete(schema.partSkillRequirements);
  await db.delete(schema.employees);
  await db.delete(schema.parts);
  await db.delete(schema.skills);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Scheduler E2E', () => {
  let app: INestApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let pool: Pool;

  const TEST_DATE = '2025-06-15';
  const PREV_DATE = '2025-06-14';

  beforeAll(async () => {
    const testDbUrl =
      process.env.TEST_DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5433/factory_scheduler_test';

    pool = new Pool({ connectionString: testDbUrl });
    db = drizzle(pool, { schema });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 1: Skill constraint — employee without required skill is NOT assigned
  // ───────────────────────────────────────────────────────────────────────────
  it('1. skill constraint: employee without required skill is never assigned', async () => {
    // Create two skills
    const assemblyRes = await request(app.getHttpServer())
      .post('/skills')
      .send({ name: 'Assembly' });
    const electronicsRes = await request(app.getHttpServer())
      .post('/skills')
      .send({ name: 'Electronics' });

    const assemblyId: string = assemblyRes.body.id;
    const electronicsId: string = electronicsRes.body.id;

    // Create one employee with ONLY Assembly skill
    const empRes = await request(app.getHttpServer())
      .post('/employees')
      .send({ name: 'Alice', skillIds: [assemblyId] });
    const aliceId: string = empRes.body.id;

    // Create a part requiring ONLY Electronics
    const partRes = await request(app.getHttpServer())
      .post('/parts')
      .send({
        name: 'Circuit Board',
        skillRequirements: [{ skillId: electronicsId, minutesPerUnit: 30 }],
      });
    const partId: string = partRes.body.id;

    // Create production requirement
    await request(app.getHttpServer())
      .post('/production-requirements')
      .send({ date: TEST_DATE, partId, quantity: 5 });

    // Generate schedule
    const res = await request(app.getHttpServer())
      .post('/generate-schedule')
      .send({ date: TEST_DATE })
      .expect(200);

    // Alice should NOT be assigned (she has Assembly, not Electronics)
    const assignedEmployeeIds = res.body.assignments.map(
      (a: { employeeId: string }) => a.employeeId,
    );
    expect(assignedEmployeeIds).not.toContain(aliceId);

    // Demand should be unmet (no Electronics employee)
    expect(res.body.unmetDemand.length).toBeGreaterThan(0);
    const unmet = res.body.unmetDemand.find(
      (u: { skillId: string }) => u.skillId === electronicsId,
    );
    expect(unmet).toBeDefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 2: Rest constraint — Night-shift employee blocked from next morning
  // ───────────────────────────────────────────────────────────────────────────
  it('2. rest constraint: night-shift employee is excluded from next morning', async () => {
    const skillRes = await request(app.getHttpServer())
      .post('/skills')
      .send({ name: 'Welding' });
    const skillId: string = skillRes.body.id;

    const empRes = await request(app.getHttpServer())
      .post('/employees')
      .send({ name: 'Bob', skillIds: [skillId] });
    const bobId: string = empRes.body.id;

    const partRes = await request(app.getHttpServer())
      .post('/parts')
      .send({
        name: 'Frame',
        skillRequirements: [{ skillId, minutesPerUnit: 10 }],
      });
    const partId: string = partRes.body.id;

    // ── Seed a NIGHT schedule for PREV_DATE directly into the DB ─────────────
    // This bypasses the greedy API (which always tries MORNING first) and lets
    // us test the rest-window logic in isolation.
    const [prevSchedule] = await db
      .insert(schema.schedules)
      .values({ date: PREV_DATE })
      .returning();

    await db.insert(schema.scheduleAssignments).values({
      scheduleId: prevSchedule.id,
      employeeId: bobId,
      skillId,
      shift: 'NIGHT',
      minutesAllocated: 480,
    });

    // ── Now generate a schedule for TEST_DATE ────────────────────────────────
    // NIGHT ends at 06:00 of TEST_DATE; MORNING starts at 06:00 of TEST_DATE
    // → gap = 0h < 8h minimum rest → Bob must be BLOCKED from MORNING
    await request(app.getHttpServer())
      .post('/production-requirements')
      .send({ date: TEST_DATE, partId, quantity: 1 });

    const day2 = await request(app.getHttpServer())
      .post('/generate-schedule')
      .send({ date: TEST_DATE })
      .expect(200);

    // Bob must NOT appear on MORNING of TEST_DATE
    const bobMorning = day2.body.assignments.find(
      (a: { employeeId: string; shift: string }) =>
        a.employeeId === bobId && a.shift === 'MORNING',
    );
    expect(bobMorning).toBeUndefined();

    // Bob may appear on SWING (gap = 8h: NIGHT ends 06:00, SWING starts 14:00)
    // or NIGHT (gap = 16h). The key assertion is that MORNING is blocked.
    // unmetDemand should be empty IF Bob is assigned to a later shift
    // (demand is only 1 unit × 10 min = 10 min, well within one shift).
    expect(day2.body.unmetDemand).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 3: Multi-skill part — both skill lanes filled independently
  // ───────────────────────────────────────────────────────────────────────────
  it('3. multi-skill part: both skill lanes receive separate assignments', async () => {
    const assemblyRes = await request(app.getHttpServer())
      .post('/skills')
      .send({ name: 'Assembly' });
    const electronicsRes = await request(app.getHttpServer())
      .post('/skills')
      .send({ name: 'Electronics' });

    const assemblyId: string = assemblyRes.body.id;
    const electronicsId: string = electronicsRes.body.id;

    // Two employees, one per skill
    await request(app.getHttpServer())
      .post('/employees')
      .send({ name: 'Alice', skillIds: [assemblyId] });
    await request(app.getHttpServer())
      .post('/employees')
      .send({ name: 'Charlie', skillIds: [electronicsId] });

    // Engine: requires both Assembly (30 min/unit) and Electronics (15 min/unit)
    const partRes = await request(app.getHttpServer())
      .post('/parts')
      .send({
        name: 'Engine',
        skillRequirements: [
          { skillId: assemblyId, minutesPerUnit: 30 },
          { skillId: electronicsId, minutesPerUnit: 15 },
        ],
      });
    const partId: string = partRes.body.id;

    // 1 engine => 30 assembly + 15 electronics
    await request(app.getHttpServer())
      .post('/production-requirements')
      .send({ date: TEST_DATE, partId, quantity: 1 });

    const res = await request(app.getHttpServer())
      .post('/generate-schedule')
      .send({ date: TEST_DATE })
      .expect(200);

    const assignedSkills = res.body.assignments.map(
      (a: { skillId: string }) => a.skillId,
    );

    // Both skill lanes must be covered
    expect(assignedSkills).toContain(assemblyId);
    expect(assignedSkills).toContain(electronicsId);

    // No unmet demand
    expect(res.body.unmetDemand).toHaveLength(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test 4: Insufficient capacity — unmetDemand returned
  // ───────────────────────────────────────────────────────────────────────────
  it('4. insufficient capacity: unmetDemand non-empty when demand exceeds employee hours', async () => {
    const skillRes = await request(app.getHttpServer())
      .post('/skills')
      .send({ name: 'Painting' });
    const skillId: string = skillRes.body.id;

    // Only one painter (max 480 min per shift)
    await request(app.getHttpServer())
      .post('/employees')
      .send({ name: 'Dave', skillIds: [skillId] });

    const partRes = await request(app.getHttpServer())
      .post('/parts')
      .send({
        name: 'Body Panel',
        skillRequirements: [{ skillId, minutesPerUnit: 60 }],
      });
    const partId: string = partRes.body.id;

    // 100 panels * 60 min = 6000 painting-minutes needed; one employee = 480 max
    await request(app.getHttpServer())
      .post('/production-requirements')
      .send({ date: TEST_DATE, partId, quantity: 100 });

    const res = await request(app.getHttpServer())
      .post('/generate-schedule')
      .send({ date: TEST_DATE })
      .expect(200);

    expect(res.body.unmetDemand.length).toBeGreaterThan(0);
    const unmet = res.body.unmetDemand.find(
      (u: { skillId: string; minutesUnmet: number }) => u.skillId === skillId,
    );
    expect(unmet).toBeDefined();
    expect(unmet.minutesUnmet).toBeGreaterThan(0);
    // One employee = 480 min consumed; 6000 - 480 = 5520 unmet
    expect(unmet.minutesUnmet).toBe(5520);
  });
});

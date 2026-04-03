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

describe('API E2E — Full Coverage', () => {
  let app: INestApplication;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let pool: Pool;

  const DATE = '2025-07-01';

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
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
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

  // ─── Skills ───────────────────────────────────────────────────────────────

  describe('Skills', () => {
    it('POST /skills → 201 with id and name', async () => {
      const res = await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Assembly' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Assembly');
    });

    it('GET /skills → 200 returns array', async () => {
      await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Assembly' });

      const res = await request(app.getHttpServer())
        .get('/skills')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Assembly');
    });

    it('GET /skills → 200 empty array when no skills exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/skills')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('POST /skills duplicate name → 409', async () => {
      await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Assembly' });

      await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Assembly' })
        .expect(409);
    });

    it('POST /skills name too short (< 2 chars) → 400', async () => {
      await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'A' })
        .expect(400);
    });

    it('POST /skills missing name → 400', async () => {
      await request(app.getHttpServer())
        .post('/skills')
        .send({})
        .expect(400);
    });

    it('POST /skills empty name → 400', async () => {
      await request(app.getHttpServer())
        .post('/skills')
        .send({ name: '' })
        .expect(400);
    });
  });

  // ─── Employees ────────────────────────────────────────────────────────────

  describe('Employees', () => {
    let skillId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Welding' });
      skillId = res.body.id;
    });

    it('POST /employees → 201 with id, name, isActive, skillIds', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [skillId] })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Alice');
      expect(res.body.isActive).toBe(true);
      expect(res.body.skillIds).toContain(skillId);
    });

    it('POST /employees missing skillIds → 400', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Bob' })
        .expect(400);
    });

    it('POST /employees empty skillIds → 400', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Bob', skillIds: [] })
        .expect(400);
    });

    it('POST /employees invalid UUID in skillIds → 400', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Bob', skillIds: ['not-a-uuid'] })
        .expect(400);
    });

    it('POST /employees duplicate skillIds deduplicates and succeeds → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Bob', skillIds: [skillId, skillId] })
        .expect(201);

      // Deduplication: skillId appears exactly once
      expect(res.body.skillIds.filter((id: string) => id === skillId)).toHaveLength(1);
    });

    it('POST /employees non-existent skillId → 400', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000001';
      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Bob', skillIds: [fakeId] })
        .expect(400);
    });

    it('GET /employees → 200 returns array with skillIds', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [skillId] });

      const res = await request(app.getHttpServer())
        .get('/employees')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].skillIds).toContain(skillId);
    });

    it('GET /employees/:id → 200 returns employee', async () => {
      const created = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [skillId] });

      const res = await request(app.getHttpServer())
        .get(`/employees/${created.body.id}`)
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.name).toBe('Alice');
    });

    it('GET /employees/:id non-existent → 404', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000002';
      await request(app.getHttpServer())
        .get(`/employees/${fakeId}`)
        .expect(404);
    });

    it('GET /employees/:id invalid UUID → 400', async () => {
      await request(app.getHttpServer())
        .get('/employees/not-a-uuid')
        .expect(400);
    });

    it('PATCH /employees/:id update name → 200', async () => {
      const created = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [skillId] });

      const res = await request(app.getHttpServer())
        .patch(`/employees/${created.body.id}`)
        .send({ name: 'Alice Updated' })
        .expect(200);

      expect(res.body.name).toBe('Alice Updated');
    });

    it('PATCH /employees/:id update isActive → 200', async () => {
      const created = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [skillId] });

      const res = await request(app.getHttpServer())
        .patch(`/employees/${created.body.id}`)
        .send({ isActive: false })
        .expect(200);

      expect(res.body.isActive).toBe(false);
    });

    it('PATCH /employees/:id update skillIds → 200', async () => {
      const skill2Res = await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Painting' });
      const skill2Id = skill2Res.body.id;

      const created = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [skillId] });

      const res = await request(app.getHttpServer())
        .patch(`/employees/${created.body.id}`)
        .send({ skillIds: [skill2Id] })
        .expect(200);

      expect(res.body.skillIds).toContain(skill2Id);
      expect(res.body.skillIds).not.toContain(skillId);
    });

    it('PATCH /employees/:id empty name → 400', async () => {
      const created = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [skillId] });

      await request(app.getHttpServer())
        .patch(`/employees/${created.body.id}`)
        .send({ name: '' })
        .expect(400);
    });

    it('PATCH /employees/:id non-existent → 404', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000003';
      await request(app.getHttpServer())
        .patch(`/employees/${fakeId}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });

    it('PATCH /employees/:id invalid UUID → 400', async () => {
      await request(app.getHttpServer())
        .patch('/employees/not-a-uuid')
        .send({ name: 'Ghost' })
        .expect(400);
    });
  });

  // ─── Parts ────────────────────────────────────────────────────────────────

  describe('Parts', () => {
    let skillId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Assembly' });
      skillId = res.body.id;
    });

    it('POST /parts → 201 with id, name, skillRequirements', async () => {
      const res = await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId, minutesPerUnit: 30 }],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Engine');
      expect(res.body.skillRequirements).toHaveLength(1);
      expect(res.body.skillRequirements[0].skillId).toBe(skillId);
      expect(res.body.skillRequirements[0].minutesPerUnit).toBe(30);
    });

    it('POST /parts missing skillRequirements → 400', async () => {
      await request(app.getHttpServer())
        .post('/parts')
        .send({ name: 'Engine' })
        .expect(400);
    });

    it('POST /parts empty skillRequirements → 400', async () => {
      await request(app.getHttpServer())
        .post('/parts')
        .send({ name: 'Engine', skillRequirements: [] })
        .expect(400);
    });

    it('POST /parts minutesPerUnit < 1 → 400', async () => {
      await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId, minutesPerUnit: 0 }],
        })
        .expect(400);
    });

    it('POST /parts non-existent skillId → 400', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000010';
      await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId: fakeId, minutesPerUnit: 30 }],
        })
        .expect(400);
    });

    it('GET /parts → 200 returns array with skillRequirements', async () => {
      await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId, minutesPerUnit: 30 }],
        });

      const res = await request(app.getHttpServer())
        .get('/parts')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].skillRequirements).toHaveLength(1);
    });

    it('GET /parts/:id → 200 returns part', async () => {
      const created = await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId, minutesPerUnit: 30 }],
        });

      const res = await request(app.getHttpServer())
        .get(`/parts/${created.body.id}`)
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.skillRequirements).toHaveLength(1);
    });

    it('GET /parts/:id non-existent → 404', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000011';
      await request(app.getHttpServer())
        .get(`/parts/${fakeId}`)
        .expect(404);
    });

    it('GET /parts/:id invalid UUID → 400', async () => {
      await request(app.getHttpServer())
        .get('/parts/not-a-uuid')
        .expect(400);
    });

    it('PATCH /parts/:id update name → 200', async () => {
      const created = await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId, minutesPerUnit: 30 }],
        });

      const res = await request(app.getHttpServer())
        .patch(`/parts/${created.body.id}`)
        .send({ name: 'Engine v2' })
        .expect(200);

      expect(res.body.name).toBe('Engine v2');
    });

    it('PATCH /parts/:id update skillRequirements → 200', async () => {
      const skill2Res = await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Electronics' });
      const skill2Id = skill2Res.body.id;

      const created = await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId, minutesPerUnit: 30 }],
        });

      const res = await request(app.getHttpServer())
        .patch(`/parts/${created.body.id}`)
        .send({
          skillRequirements: [{ skillId: skill2Id, minutesPerUnit: 15 }],
        })
        .expect(200);

      expect(res.body.skillRequirements).toHaveLength(1);
      expect(res.body.skillRequirements[0].skillId).toBe(skill2Id);
    });

    it('PATCH /parts/:id clear skillRequirements with [] → 200', async () => {
      const created = await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId, minutesPerUnit: 30 }],
        });

      const res = await request(app.getHttpServer())
        .patch(`/parts/${created.body.id}`)
        .send({ skillRequirements: [] })
        .expect(200);

      expect(res.body.skillRequirements).toHaveLength(0);
    });

    it('PATCH /parts/:id empty name → 400', async () => {
      const created = await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId, minutesPerUnit: 30 }],
        });

      await request(app.getHttpServer())
        .patch(`/parts/${created.body.id}`)
        .send({ name: '' })
        .expect(400);
    });

    it('PATCH /parts/:id non-existent → 404', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000012';
      await request(app.getHttpServer())
        .patch(`/parts/${fakeId}`)
        .send({ name: 'Ghost' })
        .expect(404);
    });

    it('PATCH /parts/:id invalid UUID → 400', async () => {
      await request(app.getHttpServer())
        .patch('/parts/not-a-uuid')
        .send({ name: 'Ghost' })
        .expect(400);
    });
  });

  // ─── Production Requirements ──────────────────────────────────────────────

  describe('Production Requirements', () => {
    let skillId: string;
    let partId: string;

    beforeEach(async () => {
      const skillRes = await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Assembly' });
      skillId = skillRes.body.id;

      const partRes = await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Engine',
          skillRequirements: [{ skillId, minutesPerUnit: 30 }],
        });
      partId = partRes.body.id;
    });

    it('POST /production-requirements → 201 with date, partId, quantity', async () => {
      const res = await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 10 })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.date).toBe(DATE);
      expect(res.body.partId).toBe(partId);
      expect(res.body.quantity).toBe(10);
    });

    it('POST /production-requirements upsert: same date+partId updates quantity → 201', async () => {
      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 5 });

      const res = await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 20 })
        .expect(201);

      expect(res.body.quantity).toBe(20);
    });

    it('POST /production-requirements invalid date format → 400', async () => {
      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: '15-07-2025', partId, quantity: 10 })
        .expect(400);
    });

    it('POST /production-requirements quantity < 1 → 400', async () => {
      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 0 })
        .expect(400);
    });

    it('POST /production-requirements missing date → 400', async () => {
      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ partId, quantity: 10 })
        .expect(400);
    });

    it('POST /production-requirements missing partId → 400', async () => {
      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, quantity: 10 })
        .expect(400);
    });

    it('POST /production-requirements non-existent partId → 400', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000020';
      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId: fakeId, quantity: 10 })
        .expect(400);
    });

    it('GET /production-requirements?date= → 200 returns array with partName', async () => {
      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 10 });

      const res = await request(app.getHttpServer())
        .get(`/production-requirements?date=${DATE}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].partName).toBe('Engine');
      expect(res.body[0].quantity).toBe(10);
    });

    it('GET /production-requirements?date= → 200 empty array when none exist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/production-requirements?date=${DATE}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('GET /production-requirements bad date format → 400', async () => {
      await request(app.getHttpServer())
        .get('/production-requirements?date=bad-date')
        .expect(400);
    });

    it('GET /production-requirements missing date param → 400', async () => {
      await request(app.getHttpServer())
        .get('/production-requirements')
        .expect(400);
    });
  });

  // ─── Scheduler ────────────────────────────────────────────────────────────

  describe('Scheduler', () => {
    let assemblyId: string;
    let partId: string;

    beforeEach(async () => {
      const skillRes = await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Assembly' });
      assemblyId = skillRes.body.id;

      const partRes = await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Bracket',
          skillRequirements: [{ skillId: assemblyId, minutesPerUnit: 10 }],
        });
      partId = partRes.body.id;
    });

    it('POST /generate-schedule → 200 with scheduleId, assignments, unmetDemand', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [assemblyId] });

      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 10 });

      const res = await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE })
        .expect(200);

      expect(res.body.scheduleId).toBeDefined();
      expect(res.body.date).toBe(DATE);
      expect(Array.isArray(res.body.assignments)).toBe(true);
      expect(Array.isArray(res.body.unmetDemand)).toBe(true);
      expect(res.body.assignments.length).toBeGreaterThan(0);
      expect(res.body.unmetDemand).toHaveLength(0);
    });

    it('POST /generate-schedule no requirements → 400', async () => {
      await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: '1999-01-01' })
        .expect(400);
    });

    it('POST /generate-schedule invalid date format → 400', async () => {
      await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: '01-07-2025' })
        .expect(400);
    });

    it('POST /generate-schedule missing date → 400', async () => {
      await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({})
        .expect(400);
    });

    it('GET /schedules/:date → 200 returns schedule and assignments', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [assemblyId] });

      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 1 });

      await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE });

      const res = await request(app.getHttpServer())
        .get(`/schedules/${DATE}`)
        .expect(200);

      expect(res.body.schedule).toBeDefined();
      expect(res.body.schedule.date).toBe(DATE);
      expect(Array.isArray(res.body.assignments)).toBe(true);
    });

    it('GET /schedules/:date not found → 404', async () => {
      await request(app.getHttpServer())
        .get('/schedules/1999-12-31')
        .expect(404);
    });

    it('GET /schedules/:date bad format → 400', async () => {
      await request(app.getHttpServer())
        .get('/schedules/bad-date')
        .expect(400);
    });

    it('POST /generate-schedule re-run replaces existing schedule', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [assemblyId] });

      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 1 });

      const first = await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE })
        .expect(200);

      const second = await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE })
        .expect(200);

      // A new scheduleId is issued each time
      expect(second.body.scheduleId).not.toBe(first.body.scheduleId);

      // Only one schedule exists for the date
      const getRes = await request(app.getHttpServer())
        .get(`/schedules/${DATE}`)
        .expect(200);

      expect(getRes.body.schedule.id).toBe(second.body.scheduleId);
    });

    it('inactive employee is not scheduled', async () => {
      // Create employee then deactivate
      const empRes = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Inactive Alice', skillIds: [assemblyId] });

      await request(app.getHttpServer())
        .patch(`/employees/${empRes.body.id}`)
        .send({ isActive: false });

      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 1 });

      const res = await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE })
        .expect(200);

      // Inactive employee should not be in assignments
      const assignedIds = res.body.assignments.map(
        (a: { employeeId: string }) => a.employeeId,
      );
      expect(assignedIds).not.toContain(empRes.body.id);

      // All demand is unmet (no active employees)
      expect(res.body.unmetDemand.length).toBeGreaterThan(0);
    });

    it('demand > one shift (480 min) requires multiple employees across shifts', async () => {
      // Each employee provides 480 min; need >480 total
      const emp1 = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Worker 1', skillIds: [assemblyId] });

      const emp2 = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Worker 2', skillIds: [assemblyId] });

      // 100 units × 10 min = 1000 assembly-minutes needed; 2 employees = 960 min max
      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 100 });

      const res = await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE })
        .expect(200);

      const assignedIds = res.body.assignments.map(
        (a: { employeeId: string }) => a.employeeId,
      );
      expect(assignedIds).toContain(emp1.body.id);
      expect(assignedIds).toContain(emp2.body.id);

      // Still 40 min unmet (1000 - 960 = 40)
      expect(res.body.unmetDemand.length).toBeGreaterThan(0);
      expect(res.body.unmetDemand[0].minutesUnmet).toBe(40);
    });

    it('assignments have correct shape (employeeId, skillId, shift, minutesAllocated)', async () => {
      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Alice', skillIds: [assemblyId] });

      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 5 });

      const res = await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE })
        .expect(200);

      const a = res.body.assignments[0];
      expect(a.employeeId).toBeDefined();
      expect(a.skillId).toBe(assemblyId);
      expect(['MORNING', 'SWING', 'NIGHT']).toContain(a.shift);
      expect(typeof a.minutesAllocated).toBe('number');
      expect(a.minutesAllocated).toBeGreaterThan(0);
      expect(a.minutesAllocated).toBeLessThanOrEqual(480);
    });

    it('SWING prev-day → MORNING next-day: exactly 8h gap is allowed', async () => {
      const empRes = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Charlie', skillIds: [assemblyId] });
      const charlieId = empRes.body.id;

      // Seed a SWING assignment for the previous day directly
      const prevDate = '2025-06-30'; // one day before DATE (2025-07-01)
      const [prevSchedule] = await db
        .insert(schema.schedules)
        .values({ date: prevDate })
        .returning();

      await db.insert(schema.scheduleAssignments).values({
        scheduleId: prevSchedule.id,
        employeeId: charlieId,
        skillId: assemblyId,
        shift: 'SWING', // ends 22:00; MORNING starts 06:00 next day = 8h gap
        minutesAllocated: 480,
      });

      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 1 });

      const res = await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE })
        .expect(200);

      // Charlie should be assigned (8h gap meets the >= 8h minimum)
      const assignedIds = res.body.assignments.map(
        (a: { employeeId: string }) => a.employeeId,
      );
      expect(assignedIds).toContain(charlieId);

      // Demand met — no unmet
      expect(res.body.unmetDemand).toHaveLength(0);
    });

    it('MORNING prev-day → MORNING next-day: 16h gap is allowed', async () => {
      const empRes = await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Dave', skillIds: [assemblyId] });
      const daveId = empRes.body.id;

      const prevDate = '2025-06-30';
      const [prevSchedule] = await db
        .insert(schema.schedules)
        .values({ date: prevDate })
        .returning();

      await db.insert(schema.scheduleAssignments).values({
        scheduleId: prevSchedule.id,
        employeeId: daveId,
        skillId: assemblyId,
        shift: 'MORNING', // ends 14:00; MORNING starts 06:00 next day = 16h gap
        minutesAllocated: 480,
      });

      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId, quantity: 1 });

      const res = await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE })
        .expect(200);

      const assignedIds = res.body.assignments.map(
        (a: { employeeId: string }) => a.employeeId,
      );
      expect(assignedIds).toContain(daveId);
      expect(res.body.unmetDemand).toHaveLength(0);
    });

    it('employee is only assigned once per day even with multiple matching skill lanes', async () => {
      // Employee has both skills; part requires both
      const elecRes = await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'Electronics' });
      const elecId = elecRes.body.id;

      await request(app.getHttpServer())
        .post('/employees')
        .send({ name: 'Multi-Skill Alice', skillIds: [assemblyId, elecId] });

      const multiPartRes = await request(app.getHttpServer())
        .post('/parts')
        .send({
          name: 'Multi-Part',
          skillRequirements: [
            { skillId: assemblyId, minutesPerUnit: 10 },
            { skillId: elecId, minutesPerUnit: 10 },
          ],
        });

      await request(app.getHttpServer())
        .post('/production-requirements')
        .send({ date: DATE, partId: multiPartRes.body.id, quantity: 1 });

      const res = await request(app.getHttpServer())
        .post('/generate-schedule')
        .send({ date: DATE })
        .expect(200);

      // Employee appears at most once
      const assignedIds = res.body.assignments.map(
        (a: { employeeId: string }) => a.employeeId,
      );
      const uniqueIds = new Set(assignedIds);
      expect(assignedIds.length).toBe(uniqueIds.size);
    });
  });
});

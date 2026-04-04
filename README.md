# Factory Auto-Scheduler Backend

A production-ready REST service that auto-assigns factory employees to shifts to meet daily part production quotas.

Built with **NestJS · PostgreSQL · Drizzle ORM** for an interview-grade demonstration of a clean, deterministic, and fully explainable scheduling system.

---

## Architecture

```
.
├── docs/
│   ├── factory-auto-scheduler.postman_collection.json
│   ├── POSTMAN_GUIDE.md
│   └── factory_auto_scheduler_technical_handoff.md
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── common/
│   │   ├── filters/http-exception.filter.ts   # Consistent error shape
│   │   └── pipes/parse-date.pipe.ts           # YYYY-MM-DD guard
│   ├── database/
│   │   ├── database.module.ts                 # Global Drizzle provider
│   │   └── schema/                            # 8 Drizzle table definitions
│   └── modules/
│       ├── skills/
│       ├── employees/
│       ├── parts/
│       ├── production-requirements/
│       └── scheduler/                         # Core greedy algorithm
├── test/
│   └── scheduler.e2e-spec.ts                  # 4 E2E scenarios
├── docker-compose.yml
├── drizzle.config.ts
└── .env.example
```

---

## Prerequisites

- **Node.js** ≥ 20
- **Docker** + Docker Compose

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd Factory-Auto-Scheduler-Backend
npm install

# 2. Configure environment
cp .env.example .env
# .env ships with safe defaults — no changes needed for local dev

# 3. Start Postgres (dev on :5434, test on :5433)
docker compose up -d

# 4. Apply schema + seed demo data  (or run db:push and db:seed separately)
npm run db:setup

# 5. Start the dev server
npm run start:dev
# → http://localhost:3000
```

> **Note:** The dev Postgres container binds to host port **5434** (not 5432) to avoid conflicts with any locally installed Postgres instance.

> **Port conflict?** If you see `Error: listen EADDRINUSE :::3000`, a previous server instance is still running. Kill it with:
> ```bash
> lsof -ti :3000 | xargs kill -9
> ```
> Then re-run `npm run start:dev`.

---

## Demo Data (seeder)

`npm run db:seed` loads a realistic factory scenario into the dev database so you can immediately run the scheduler and see real output. The seed is **idempotent** — safe to run multiple times.

**What gets seeded:**

| Type | Items |
|---|---|
| Skills | Assembly · Electronics · Welding · Painting |
| Parts | Engine (Assembly + Electronics) · Body Panel (Welding + Painting) · Gear (Assembly) |
| Employees | Alice Chen · Bob Martinez · Carol White · Dave Kim · Eva Rodriguez · Frank Turner *(inactive)* |
| Production requirements | 10 Engines + 20 Body Panels + 30 Gears — for **today's date** |

**After seeding, run the scheduler:**

```bash
curl -X POST http://localhost:3000/generate-schedule \
  -H 'Content-Type: application/json' \
  -d "{\"date\":\"$(date +%Y-%m-%d)\"}"
```

**Expected result:**

| Shift | Employee | Skill | Minutes |
|---|---|---|---|
| MORNING | Alice Chen | Assembly | 480 |
| MORNING | Bob Martinez | Assembly | 180 |
| MORNING | Dave Kim | Welding | 480 |
| MORNING | Eva Rodriguez | Welding | 20 |
| MORNING | Carol White | Electronics | 150 |
| — | *Painting* | *unmet* | *200 min* |

> Frank Turner (Painting) is **inactive** and excluded from scheduling, leaving 200 painting-minutes unmet. This demonstrates all three scheduler features: multi-employee lanes, rest enforcement, and `unmetDemand`.

---

## Endpoint Reference

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/skills` | `{ name }` | Create a skill |
| `GET` | `/skills` | — | List all skills |
| `PATCH` | `/skills/:id` | `{ name? }` | Rename a skill |
| `POST` | `/employees` | `{ name, skillIds[] }` | Create an employee |
| `GET` | `/employees` | — | List all employees |
| `GET` | `/employees/:id` | — | Get employee by ID |
| `PATCH` | `/employees/:id` | `{ name?, isActive?, skillIds? }` | Update employee |
| `POST` | `/parts` | `{ name, skillRequirements[] }` | Create a part |
| `GET` | `/parts` | — | List all parts |
| `GET` | `/parts/:id` | — | Get part by ID |
| `PATCH` | `/parts/:id` | `{ name?, skillRequirements? }` | Update part |
| `POST` | `/production-requirements` | `{ date, partId, quantity }` | Set daily quota (upsert) |
| `GET` | `/production-requirements?date=` | — | Get requirements for a date |
| `POST` | `/generate-schedule` | `{ date }` | Run the scheduler |
| `GET` | `/schedules/:date` | — | Retrieve a saved schedule |

### Example: create and schedule

```bash
# Skills
curl -X POST http://localhost:3000/skills -H 'Content-Type: application/json' \
  -d '{"name":"Assembly"}'

# Employee
curl -X POST http://localhost:3000/employees -H 'Content-Type: application/json' \
  -d '{"name":"Alice","skillIds":["<assembly-id>"]}'

# Part (Engine needs 30 min Assembly + 15 min Electronics per unit)
curl -X POST http://localhost:3000/parts -H 'Content-Type: application/json' \
  -d '{"name":"Engine","skillRequirements":[{"skillId":"<assembly-id>","minutesPerUnit":30}]}'

# Requirement
curl -X POST http://localhost:3000/production-requirements \
  -H 'Content-Type: application/json' \
  -d '{"date":"2025-06-15","partId":"<part-id>","quantity":20}'

# Generate
curl -X POST http://localhost:3000/generate-schedule \
  -H 'Content-Type: application/json' -d '{"date":"2025-06-15"}'
```

> **Postman:** import `docs/factory-auto-scheduler.postman_collection.json` for a fully pre-configured collection with auto-captured IDs. See `docs/POSTMAN_GUIDE.md`.

---

## Scheduling Algorithm

The scheduler uses a **deterministic greedy algorithm** designed for clarity over optimality.

**Step 1 — Demand expansion.** Production requirements are joined with `part_skill_requirements` to produce a `Map<skillId, totalMinutesNeeded>`. For example, 20 engines requiring 30 assembly minutes each yields 600 assembly-minutes of demand. Multi-skill parts contribute independently to each skill lane.

**Step 2 — Eligibility filtering.** For each of three shifts (`MORNING 06:00–14:00`, `SWING 14:00–22:00`, `NIGHT 22:00–06:00`) the algorithm iterates skill lanes sorted by remaining demand descending. For each lane it finds employees possessing that skill, filters out those already assigned today, and filters out those violating the **8-hour rest window** (checking the previous day's schedule assignments).

**Step 3 — Greedy fill.** Eligible employees are assigned FIFO. Each assignment consumes `min(480, remainingDemand)` minutes. Once an employee is assigned to any skill lane they are marked as unavailable for the day. After all shifts any demand still unsatisfied is returned as `unmetDemand`.

---

## Data Model

| Table | Purpose |
|---|---|
| `skills` | Skill catalog |
| `employees` | Employee roster |
| `employee_skills` | M:N employee ↔ skill |
| `parts` | Part catalog |
| `part_skill_requirements` | Minutes-per-unit per skill per part |
| `production_requirements` | Daily quota per part (unique on date+part) |
| `schedules` | One row per scheduled date |
| `schedule_assignments` | One row per employee-shift assignment |

---

## Design Trade-offs

| Decision | Rationale |
|---|---|
| Greedy, not optimal | Globally optimal scheduling (ILP/SAT) is overkill for an interview demo; greedy is deterministic and explainable |
| One shift per employee per day | Simplifies rest-rule enforcement; real factories may differ |
| Labor-minute model | Avoids full production-line dependency graph; correct for this scope |
| Silent re-generation | `POST /generate-schedule` replaces existing schedule; simpler than 409 for demo use |
| UUID primary keys | Avoids sequential-ID guessing; standard practice |

---

## Running Tests

```bash
# Both Postgres containers must be running first
docker compose up -d

# Apply schema to the test DB (port 5433)
DATABASE_URL=postgres://postgres:postgres@localhost:5433/factory_scheduler_test \
  npx drizzle-kit push

# Run E2E suite
npm run test:e2e
```

The suite covers 56 scenarios across all modules: full CRUD + validation on every endpoint, skill constraint, rest constraint, multi-skill part, insufficient capacity, and scheduler edge cases.

---

## Documentation

| File | Description |
|---|---|
| `docs/factory-auto-scheduler.postman_collection.json` | Postman collection — import directly into Postman |
| `docs/POSTMAN_GUIDE.md` | Step-by-step Postman usage guide |
| `docs/factory_auto_scheduler_technical_handoff.md` | Original assignment specification |

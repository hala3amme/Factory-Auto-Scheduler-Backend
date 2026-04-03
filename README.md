# Factory Auto-Scheduler Backend

A production-ready REST service that auto-assigns factory employees to shifts to meet daily part production quotas.

Built with **NestJS · PostgreSQL · Drizzle ORM** for an interview-grade demonstration of a clean, deterministic, and fully explainable scheduling system.

---

## Architecture

```
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── filters/http-exception.filter.ts   # Consistent error shape
│   └── pipes/parse-date.pipe.ts           # YYYY-MM-DD guard
├── database/
│   ├── database.module.ts                 # Global Drizzle provider
│   └── schema/                            # 8 Drizzle table definitions
└── modules/
    ├── skills/
    ├── employees/
    ├── parts/
    ├── production-requirements/
    └── scheduler/                         # Core greedy algorithm
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

# 3. Start Postgres
docker compose up -d postgres

# 4. Run migrations
npm run migrate

# 5. Start the dev server
npm run start:dev
# → http://localhost:3000
```

---

## Endpoint Reference

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/skills` | `{ name }` | Create a skill |
| `GET` | `/skills` | — | List all skills |
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
# Start test Postgres (port 5433)
docker compose up -d postgres_test

# Generate and run migrations against test DB
DATABASE_URL=postgres://postgres:postgres@localhost:5433/factory_scheduler_test npm run migrate

# Run E2E suite
npm run test:e2e
```

The suite covers four deterministic scenarios: skill constraint, rest constraint, multi-skill part, and insufficient capacity.

# Postman Collection Guide — Factory Auto-Scheduler API

## Import

1. Open Postman → **Import** → select `factory-auto-scheduler.postman_collection.json`
2. The collection opens with a `baseUrl` variable already set to `http://localhost:3000`

## Prerequisites

Make sure the app is running locally:

```bash
docker compose up -d          # start Postgres containers
npm run db:setup              # apply schema + seed demo data
npm run start:dev             # start API on :3000
```

> **Tip — skip manual setup with the seeder:** `npm run db:setup` seeds 4 skills, 3 parts, 6 employees (1 inactive), and today's production requirements. You can jump straight to **step 6 (Generate Schedule)** without running steps 1–5 manually. The `scheduleDate` variable is pre-set to `2025-06-15`; change it to today's date to match the seeded requirements.

---

## Collection Variables

These are automatically populated by test scripts after each creation request.
You **do not need to set them manually**.

| Variable | Set by | Used by |
|---|---|---|
| `baseUrl` | You (default: `http://localhost:3000`) | All requests |
| `assemblySkillId` | Create Skill — Assembly | Employees, Parts, Scheduler |
| `electronicsSkillId` | Create Skill — Electronics | Employees, Parts |
| `employeeId` | Create Employee | Get/Update Employee |
| `partId` | Create Part — Engine | Production Requirements, Scheduler |
| `scheduleDate` | You (default: `2025-06-15`) | All scheduler requests |

---

## Recommended Usage Order

Run the requests **in this exact order** for a complete end-to-end demo:

```
1. Skills / Create Skill — Assembly
2. Skills / Create Skill — Electronics
3. Employees / Create Employee
4. Parts / Create Part — Engine (multi-skill)
5. Production Requirements / Set Production Requirement
6. Scheduler / Generate Schedule        ← core algorithm runs here
7. Scheduler / Get Schedule by Date     ← retrieve saved result
```

After step 6 you will see:
- **`assignments[]`** — which employee is on which shift, for which skill
- **`unmetDemand[]`** — skill lanes that couldn't be fully staffed (empty if all demand met)

---

## Request Descriptions

### Skills

| Request | Method | Path | What it does |
|---|---|---|---|
| Create Skill | POST | `/skills` | Adds a skill to the catalog. `name` must be unique. |
| List All Skills | GET | `/skills` | Returns all skills. |
| Update Skill | PATCH | `/skills/:id` | Renames a skill. `name` must be non-empty and unique. |

**Create body:**
```json
{ "name": "Assembly" }
```

**Update body (all fields optional):**
```json
{ "name": "Mechanical Assembly" }
```

---

### Employees

| Request | Method | Path | What it does |
|---|---|---|---|
| Create Employee | POST | `/employees` | Creates employee with 1+ assigned skills. |
| List All Employees | GET | `/employees` | Returns all employees with their skillIds. |
| Get Employee by ID | GET | `/employees/:id` | Returns a single employee. |
| Update Employee | PATCH | `/employees/:id` | Updates name, active status, or skill list. |

**Create body:**
```json
{
  "name": "Alice Smith",
  "skillIds": ["<assemblySkillId>", "<electronicsSkillId>"]
}
```

**Update body (all fields optional):**
```json
{
  "name": "Alice Johnson",
  "isActive": false,
  "skillIds": ["<assemblySkillId>"]
}
```

---

### Parts

| Request | Method | Path | What it does |
|---|---|---|---|
| Create Part | POST | `/parts` | Creates a part with per-skill minute requirements. |
| List All Parts | GET | `/parts` | Returns all parts with their skill requirements. |
| Get Part by ID | GET | `/parts/:id` | Returns a single part. |
| Update Part | PATCH | `/parts/:id` | Updates name or skill requirements. |

**Create body (Engine example — multi-skill):**
```json
{
  "name": "Engine",
  "skillRequirements": [
    { "skillId": "<assemblySkillId>",    "minutesPerUnit": 30 },
    { "skillId": "<electronicsSkillId>", "minutesPerUnit": 15 }
  ]
}
```

> 20 engines → 600 Assembly-minutes + 300 Electronics-minutes of demand.

---

### Production Requirements

| Request | Method | Path | What it does |
|---|---|---|---|
| Set Requirement | POST | `/production-requirements` | Sets the daily quota (upsert — calling again updates quantity). |
| Get by Date | GET | `/production-requirements?date=` | Returns all requirements for a date. `date` must be `YYYY-MM-DD`. |

**Body:**
```json
{
  "date": "2025-06-15",
  "partId": "<partId>",
  "quantity": 20
}
```

---

### Scheduler

| Request | Method | Path | What it does |
|---|---|---|---|
| Generate Schedule | POST | `/generate-schedule` | Runs the greedy algorithm for the given date. |
| Get Schedule | GET | `/schedules/:date` | Retrieves a previously generated schedule. |

**Generate body:**
```json
{ "date": "2025-06-15" }
```

**Response shape:**
```json
{
  "scheduleId": "uuid",
  "date": "2025-06-15",
  "assignments": [
    {
      "employeeId": "uuid",
      "skillId": "uuid",
      "shift": "MORNING",
      "minutesAllocated": 480
    }
  ],
  "unmetDemand": [
    { "skillId": "uuid", "minutesUnmet": 120 }
  ]
}
```

> **Shifts:** `MORNING` (06:00–14:00) · `SWING` (14:00–22:00) · `NIGHT` (22:00–06:00)  
> **Rest rule:** An employee cannot be assigned if their previous shift ended < 8 hours before the candidate shift starts.  
> **Re-run:** Calling Generate Schedule again for the same date silently replaces the existing schedule.

---

### Error Cases

Demonstrates the API's validation and error responses.

| Request | Expected status | Why |
|---|---|---|
| Create Employee — missing skillIds | `400` | `skillIds` is required and must have ≥ 1 entry |
| Create Employee — unknown skillId | `400` | Referenced skill UUID does not exist (FK violation) |
| Create Skill — duplicate name | `409` | Skill name must be unique (unique constraint) |
| Update Employee — empty name | `400` | `name` is optional but cannot be an empty string |
| Get Employee — invalid UUID | `400` | Path param must be a valid UUID v4 |
| Get Requirements — bad date | `400` | `date` query param must be `YYYY-MM-DD` |
| Generate Schedule — no requirements | `400` | No production requirements exist for that date |
| Get Schedule — not found | `404` | No schedule generated for that date yet |

**Error response shape:**
```json
{
  "statusCode": 400,
  "timestamp": "2025-06-15T10:00:00.000Z",
  "path": "/employees/not-a-uuid",
  "message": "Validation failed (uuid v4 is expected)"
}
```

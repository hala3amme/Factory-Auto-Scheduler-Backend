
# Factory Auto-Scheduler — Technical Design & LLM Execution Handoff

## Objective
Build an interview-grade backend in **NestJS + PostgreSQL + Drizzle ORM** for a car factory scheduler that:
- manages employees, skills, parts, and daily production requirements
- generates a daily shift roster
- respects skill constraints
- respects rest constraints
- supports parts requiring multiple skills
- includes migrations, Docker, tests, and README

## Core interpretation
Use **REST**, not GraphQL.  
Use a **deterministic greedy scheduler**, not a mathematically optimal solver.  
Design for **clarity, correctness, and explainability**.

## Key assumptions
- One schedule generation request targets one production date.
- Each employee can work **at most one shift per date**.
- Each shift is **8 hours = 480 minutes**.
- Multi-skill parts consume labor minutes from **each required skill lane**.
- Return **unmetDemand** if capacity is insufficient.

## Required tables
- employees
- skills
- employee_skills
- parts
- part_skill_requirements
- production_requirements
- schedules
- schedule_assignments

## Multi-skill modeling
Do **not** model a multi-skill part as “choose one skill.”
Model it as:
- part_skill_requirements(part_id, skill_id, minutes_per_unit)

Example:
- Engine requires 30 assembly minutes + 15 electronics minutes
- 20 engines => 600 assembly minutes + 300 electronics minutes

## REST endpoints
- POST /skills
- GET /skills
- POST /employees
- GET /employees
- GET /employees/:id
- PATCH /employees/:id
- POST /parts
- GET /parts
- GET /parts/:id
- PATCH /parts/:id
- POST /production-requirements
- GET /production-requirements?date=YYYY-MM-DD
- POST /generate-schedule
- GET /schedules/:date

## Scheduling algorithm
1. Load production requirements for the date.
2. Expand requirements into total required minutes per skill.
3. Load active employees and their skills.
4. Load previous assignments to enforce minimum rest.
5. For each shift (MORNING, SWING, NIGHT):
   - for each skill demand sorted by remaining minutes descending:
     - find legal employees with that skill
     - exclude already-assigned employees for that date
     - exclude employees violating rest window
     - assign employees greedily until the demand is filled or capacity is exhausted
6. Save schedule and assignments transactionally.
7. Return assignments + unmetDemand.

## Rest rule
Implement a generic **minimum rest window of 8 hours** between the end of the previous assignment and the start of the next one.  
This automatically blocks **Night -> Morning** across adjacent days.

## Suggested NestJS modules
- database
- skills
- employees
- parts
- production-requirements
- scheduler
- common

## Suggested project layout
```text
src/
  app.module.ts
  main.ts
  common/
  database/
    schema/
  modules/
    skills/
    employees/
    parts/
    production-requirements/
    scheduler/
test/
  scheduler.e2e-spec.ts
drizzle.config.ts
docker-compose.yml
Dockerfile
README.md
```

## Complexity
If:
- R = production requirement rows
- K = expanded skill-demand lanes
- E = employees
- S = shifts (constant = 3)

Then a straightforward implementation is approximately:
**O(R + K * E * S)** => effectively **O(R + K * E)**.

## Must-have test cases
- Skill constraint respected
- Rest constraint respected
- Multi-skill part supported
- Insufficient capacity returns unmetDemand

## Explicit trade-offs
- Greedy, not globally optimal
- One shift per employee per day
- Labor-minute model, not full production-line dependency graph
- Correctness and clarity prioritized over optimization

## Critical implementation guidance for another LLM
Build the system exactly with:
- NestJS
- PostgreSQL
- Drizzle ORM
- REST APIs
- DTO validation
- transaction-safe persistence
- UUID primary keys
- shift enum: MORNING, SWING, NIGHT

Do not introduce:
- complex optimization solvers
- event-driven architecture
- CQRS/DDD ceremony
- unnecessary infra complexity

## Final directive
The winning solution is **simple, deterministic, modular, and explainable**.

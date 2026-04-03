import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import {
  productionRequirements,
  partSkillRequirements,
  employees,
  employeeSkills,
  schedules,
  scheduleAssignments,
} from '../../database/schema';
import { GenerateScheduleDto } from './dto/generate-schedule.dto';

// ─── Shift windows (UTC) ───────────────────────────────────────────────────
const SHIFT_WINDOWS = {
  MORNING: { start: 6, end: 14 },   // 06:00–14:00
  SWING:   { start: 14, end: 22 },  // 14:00–22:00
  NIGHT:   { start: 22, end: 30 },  // 22:00–06:00+1  (end=30h for arithmetic)
} as const;

type Shift = keyof typeof SHIFT_WINDOWS;

const SHIFTS: Shift[] = ['MORNING', 'SWING', 'NIGHT'];
const SHIFT_DURATION_MINUTES = 480; // 8 h × 60 min
const MIN_REST_HOURS = 8;

// Epoch hours for a given date + shift boundary
function shiftBoundaryHour(dateStr: string, offsetHours: number): number {
  const epochMs = new Date(`${dateStr}T00:00:00Z`).getTime();
  return epochMs / 3_600_000 + offsetHours;
}

@Injectable()
export class SchedulerService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  // ─── POST /generate-schedule ─────────────────────────────────────────────
  async generateSchedule(dto: GenerateScheduleDto) {
    const { date } = dto;

    // ── Step 1: Load production requirements for this date ──────────────────
    const requirements = await this.db
      .select({
        partId: productionRequirements.partId,
        quantity: productionRequirements.quantity,
        skillId: partSkillRequirements.skillId,
        minutesPerUnit: partSkillRequirements.minutesPerUnit,
      })
      .from(productionRequirements)
      .innerJoin(
        partSkillRequirements,
        eq(productionRequirements.partId, partSkillRequirements.partId),
      )
      .where(eq(productionRequirements.date, date));

    if (!requirements.length) {
      throw new BadRequestException(
        `No production requirements found for date ${date}`,
      );
    }

    // ── Step 2: Build Map<skillId, totalMinutesNeeded> ──────────────────────
    const demandMap = new Map<string, number>();
    for (const row of requirements) {
      const total = row.quantity * row.minutesPerUnit;
      demandMap.set(row.skillId, (demandMap.get(row.skillId) ?? 0) + total);
    }

    // ── Step 3: Load active employees with their skill IDs ──────────────────
    const employeeRows = await this.db
      .select({
        id: employees.id,
        name: employees.name,
        skillId: employeeSkills.skillId,
      })
      .from(employees)
      .innerJoin(employeeSkills, eq(employees.id, employeeSkills.employeeId))
      .where(eq(employees.isActive, true));

    // Group into Map<employeeId, { id, name, skillIds: Set }>
    type EmployeeRecord = {
      id: string;
      name: string;
      skillIds: Set<string>;
    };
    const employeeMap = new Map<string, EmployeeRecord>();
    for (const row of employeeRows) {
      if (!employeeMap.has(row.id)) {
        employeeMap.set(row.id, { id: row.id, name: row.name, skillIds: new Set() });
      }
      employeeMap.get(row.id)!.skillIds.add(row.skillId);
    }
    const allEmployees = Array.from(employeeMap.values());

    // ── Step 4: Load previous day's assignments for rest-window check ────────
    const prevDate = this.subtractOneDay(date);
    const prevAssignments = await this.db
      .select({
        employeeId: scheduleAssignments.employeeId,
        shift: scheduleAssignments.shift,
      })
      .from(scheduleAssignments)
      .innerJoin(schedules, eq(scheduleAssignments.scheduleId, schedules.id))
      .where(eq(schedules.date, prevDate));

    const prevShiftByEmployee = new Map<string, Shift>();
    for (const a of prevAssignments) {
      prevShiftByEmployee.set(a.employeeId, a.shift as Shift);
    }

    // ── Step 5: Greedy assignment across shifts ──────────────────────────────
    // remainingDemand is shared across shifts — once minutes are filled by any
    // shift we no longer need them (we track global outstanding demand).
    const remainingDemand = new Map(demandMap);
    const assignedToday = new Set<string>(); // employees already assigned today

    const assignments: {
      employeeId: string;
      skillId: string;
      shift: Shift;
      minutesAllocated: number;
    }[] = [];

    for (const shift of SHIFTS) {
      // Sort skill lanes by remaining demand DESC (greedy: fill biggest gaps first)
      const sortedSkills = [...remainingDemand.entries()]
        .filter(([, mins]) => mins > 0)
        .sort((a, b) => b[1] - a[1]);

      for (const [skillId, _] of sortedSkills) {
        if ((remainingDemand.get(skillId) ?? 0) <= 0) continue;

        // Filter eligible employees
        const eligible = allEmployees.filter(
          (e) =>
            e.skillIds.has(skillId) &&
            !assignedToday.has(e.id) &&
            !this.violatesRest(e.id, shift, date, prevShiftByEmployee),
        );

        for (const emp of eligible) {
          const remaining = remainingDemand.get(skillId) ?? 0;
          if (remaining <= 0) break;

          const alloc = Math.min(SHIFT_DURATION_MINUTES, remaining);
          assignments.push({
            employeeId: emp.id,
            skillId,
            shift,
            minutesAllocated: alloc,
          });
          remainingDemand.set(skillId, remaining - alloc);
          assignedToday.add(emp.id);
        }
      }
    }

    // ── Step 6: Persist — upsert schedule, replace assignments ──────────────
    const scheduleId = await this.db.transaction(async (tx) => {
      // Delete existing schedule for this date (cascade deletes assignments)
      await tx.delete(schedules).where(eq(schedules.date, date));

      const [schedule] = await tx
        .insert(schedules)
        .values({ date })
        .returning();

      if (assignments.length > 0) {
        await tx.insert(scheduleAssignments).values(
          assignments.map((a) => ({
            scheduleId: schedule.id,
            employeeId: a.employeeId,
            skillId: a.skillId,
            shift: a.shift,
            minutesAllocated: a.minutesAllocated,
          })),
        );
      }

      return schedule.id;
    });

    // ── Step 7 & 8: Build response ───────────────────────────────────────────
    const unmetDemand = [...remainingDemand.entries()]
      .filter(([, mins]) => mins > 0)
      .map(([skillId, minutesUnmet]) => ({ skillId, minutesUnmet }));

    return {
      scheduleId,
      date,
      assignments,
      unmetDemand,
    };
  }

  // ─── GET /schedules/:date ─────────────────────────────────────────────────
  async findByDate(date: string) {
    const [schedule] = await this.db
      .select()
      .from(schedules)
      .where(eq(schedules.date, date))
      .limit(1);

    if (!schedule) return null;

    const assignments = await this.db
      .select({
        id: scheduleAssignments.id,
        employeeId: scheduleAssignments.employeeId,
        skillId: scheduleAssignments.skillId,
        shift: scheduleAssignments.shift,
        minutesAllocated: scheduleAssignments.minutesAllocated,
      })
      .from(scheduleAssignments)
      .where(eq(scheduleAssignments.scheduleId, schedule.id));

    return { schedule, assignments };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private violatesRest(
    employeeId: string,
    candidateShift: Shift,
    candidateDate: string,
    prevShiftByEmployee: Map<string, Shift>,
  ): boolean {
    const prevShift = prevShiftByEmployee.get(employeeId);
    if (!prevShift) return false;

    const prevDate = this.subtractOneDay(candidateDate);
    const prevEnd = shiftBoundaryHour(prevDate, SHIFT_WINDOWS[prevShift].end);
    const candidateStart = shiftBoundaryHour(
      candidateDate,
      SHIFT_WINDOWS[candidateShift].start,
    );

    return candidateStart - prevEnd < MIN_REST_HOURS;
  }

  private subtractOneDay(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
}

import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { employees, employeeSkills } from '../../database/schema';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(dto: CreateEmployeeDto) {
    return this.db.transaction(async (tx) => {
      const [employee] = await tx
        .insert(employees)
        .values({ name: dto.name })
        .returning();

      if (dto.skillIds.length > 0) {
        await tx.insert(employeeSkills).values(
          dto.skillIds.map((skillId) => ({
            employeeId: employee.id,
            skillId,
          })),
        );
      }

      return this.findOneWithSkills(employee.id, tx);
    });
  }

  async findAll() {
    const rows = await this.db
      .select({
        id: employees.id,
        name: employees.name,
        isActive: employees.isActive,
        createdAt: employees.createdAt,
        skillId: employeeSkills.skillId,
      })
      .from(employees)
      .leftJoin(employeeSkills, eq(employees.id, employeeSkills.employeeId));

    return this.groupEmployees(rows);
  }

  async findOne(id: string) {
    const result = await this.findOneWithSkills(id, this.db);
    if (!result) throw new NotFoundException(`Employee ${id} not found`);
    return result;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(employees)
        .where(eq(employees.id, id))
        .limit(1);

      if (!existing.length) {
        throw new NotFoundException(`Employee ${id} not found`);
      }

      const updates: Partial<typeof employees.$inferInsert> = {};
      if (dto.name !== undefined) updates.name = dto.name;
      if (dto.isActive !== undefined) updates.isActive = dto.isActive;

      if (Object.keys(updates).length > 0) {
        await tx.update(employees).set(updates).where(eq(employees.id, id));
      }

      if (dto.skillIds !== undefined) {
        await tx
          .delete(employeeSkills)
          .where(eq(employeeSkills.employeeId, id));

        if (dto.skillIds.length > 0) {
          await tx.insert(employeeSkills).values(
            dto.skillIds.map((skillId) => ({ employeeId: id, skillId })),
          );
        }
      }

      return this.findOneWithSkills(id, tx);
    });
  }

  private async findOneWithSkills(id: string, db: DrizzleDB) {
    const rows = await db
      .select({
        id: employees.id,
        name: employees.name,
        isActive: employees.isActive,
        createdAt: employees.createdAt,
        skillId: employeeSkills.skillId,
      })
      .from(employees)
      .leftJoin(employeeSkills, eq(employees.id, employeeSkills.employeeId))
      .where(eq(employees.id, id));

    if (!rows.length) return null;

    const grouped = this.groupEmployees(rows);
    return grouped[0] ?? null;
  }

  private groupEmployees(
    rows: { id: string; name: string; isActive: boolean; createdAt: Date; skillId: string | null }[],
  ) {
    const map = new Map<
      string,
      { id: string; name: string; isActive: boolean; createdAt: Date; skillIds: string[] }
    >();

    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, {
          id: row.id,
          name: row.name,
          isActive: row.isActive,
          createdAt: row.createdAt,
          skillIds: [],
        });
      }
      if (row.skillId) {
        map.get(row.id)!.skillIds.push(row.skillId);
      }
    }

    return Array.from(map.values());
  }
}

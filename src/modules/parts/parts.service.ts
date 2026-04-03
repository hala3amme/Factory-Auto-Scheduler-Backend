import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { parts, partSkillRequirements } from '../../database/schema';
import { CreatePartDto } from './dto/create-part.dto';
import { UpdatePartDto } from './dto/update-part.dto';

@Injectable()
export class PartsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(dto: CreatePartDto) {
    return this.db.transaction(async (tx) => {
      const [part] = await tx
        .insert(parts)
        .values({ name: dto.name })
        .returning();

      const uniqueReqs = dto.skillRequirements.filter(
        (sr, idx, arr) => arr.findIndex((x) => x.skillId === sr.skillId) === idx,
      );
      await tx.insert(partSkillRequirements).values(
        uniqueReqs.map((sr) => ({
          partId: part.id,
          skillId: sr.skillId,
          minutesPerUnit: sr.minutesPerUnit,
        })),
      );

      return this.findOneWithRequirements(part.id, tx);
    });
  }

  async findAll() {
    const rows = await this.db
      .select({
        id: parts.id,
        name: parts.name,
        createdAt: parts.createdAt,
        skillId: partSkillRequirements.skillId,
        minutesPerUnit: partSkillRequirements.minutesPerUnit,
      })
      .from(parts)
      .leftJoin(
        partSkillRequirements,
        eq(parts.id, partSkillRequirements.partId),
      );

    return this.groupParts(rows);
  }

  async findOne(id: string) {
    const result = await this.findOneWithRequirements(id, this.db);
    if (!result) throw new NotFoundException(`Part ${id} not found`);
    return result;
  }

  async update(id: string, dto: UpdatePartDto) {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(parts)
        .where(eq(parts.id, id))
        .limit(1);

      if (!existing.length) {
        throw new NotFoundException(`Part ${id} not found`);
      }

      if (dto.name !== undefined) {
        await tx.update(parts).set({ name: dto.name }).where(eq(parts.id, id));
      }

      if (dto.skillRequirements !== undefined) {
        await tx
          .delete(partSkillRequirements)
          .where(eq(partSkillRequirements.partId, id));

        const uniqueReqs = dto.skillRequirements.filter(
          (sr, idx, arr) => arr.findIndex((x) => x.skillId === sr.skillId) === idx,
        );
        if (uniqueReqs.length > 0) {
          await tx.insert(partSkillRequirements).values(
            uniqueReqs.map((sr) => ({
              partId: id,
              skillId: sr.skillId,
              minutesPerUnit: sr.minutesPerUnit,
            })),
          );
        }
      }

      return this.findOneWithRequirements(id, tx);
    });
  }

  private async findOneWithRequirements(id: string, db: DrizzleDB) {
    const rows = await db
      .select({
        id: parts.id,
        name: parts.name,
        createdAt: parts.createdAt,
        skillId: partSkillRequirements.skillId,
        minutesPerUnit: partSkillRequirements.minutesPerUnit,
      })
      .from(parts)
      .leftJoin(
        partSkillRequirements,
        eq(parts.id, partSkillRequirements.partId),
      )
      .where(eq(parts.id, id));

    if (!rows.length) return null;
    return this.groupParts(rows)[0] ?? null;
  }

  private groupParts(
    rows: {
      id: string;
      name: string;
      createdAt: Date;
      skillId: string | null;
      minutesPerUnit: number | null;
    }[],
  ) {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        createdAt: Date;
        skillRequirements: { skillId: string; minutesPerUnit: number }[];
      }
    >();

    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, {
          id: row.id,
          name: row.name,
          createdAt: row.createdAt,
          skillRequirements: [],
        });
      }
      if (row.skillId && row.minutesPerUnit !== null) {
        map.get(row.id)!.skillRequirements.push({
          skillId: row.skillId,
          minutesPerUnit: row.minutesPerUnit,
        });
      }
    }

    return Array.from(map.values());
  }
}

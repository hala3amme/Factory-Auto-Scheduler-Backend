import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { skills } from '../../database/schema';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

@Injectable()
export class SkillsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(dto: CreateSkillDto) {
    const existing = await this.db
      .select()
      .from(skills)
      .where(eq(skills.name, dto.name))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(`Skill "${dto.name}" already exists`);
    }

    const [skill] = await this.db.insert(skills).values(dto).returning();
    return skill;
  }

  async findAll() {
    return this.db.select().from(skills);
  }

  async update(id: string, dto: UpdateSkillDto) {
    const existing = await this.db
      .select()
      .from(skills)
      .where(eq(skills.id, id))
      .limit(1);

    if (!existing.length) {
      throw new NotFoundException(`Skill ${id} not found`);
    }

    if (dto.name !== undefined) {
      const duplicate = await this.db
        .select()
        .from(skills)
        .where(eq(skills.name, dto.name))
        .limit(1);

      if (duplicate.length > 0 && duplicate[0].id !== id) {
        throw new ConflictException(`Skill "${dto.name}" already exists`);
      }

      const [updated] = await this.db
        .update(skills)
        .set({ name: dto.name })
        .where(eq(skills.id, id))
        .returning();

      return updated;
    }

    return existing[0];
  }
}

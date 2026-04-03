import { Inject, Injectable, ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { skills } from '../../database/schema';
import { CreateSkillDto } from './dto/create-skill.dto';

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
}

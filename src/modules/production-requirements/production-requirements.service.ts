import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import type { DrizzleDB } from '../../database/database.module';
import { productionRequirements, parts } from '../../database/schema';
import { CreateProductionRequirementDto } from './dto/create-production-requirement.dto';

@Injectable()
export class ProductionRequirementsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async upsert(dto: CreateProductionRequirementDto) {
    const [row] = await this.db
      .insert(productionRequirements)
      .values({
        date: dto.date,
        partId: dto.partId,
        quantity: dto.quantity,
      })
      .onConflictDoUpdate({
        target: [productionRequirements.date, productionRequirements.partId],
        set: { quantity: dto.quantity },
      })
      .returning();

    return row;
  }

  async findByDate(date: string) {
    return this.db
      .select({
        id: productionRequirements.id,
        date: productionRequirements.date,
        quantity: productionRequirements.quantity,
        partId: productionRequirements.partId,
        partName: parts.name,
      })
      .from(productionRequirements)
      .leftJoin(parts, eq(productionRequirements.partId, parts.id))
      .where(eq(productionRequirements.date, date));
  }
}

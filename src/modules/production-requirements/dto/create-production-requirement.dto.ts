import { IsString, IsNotEmpty, IsUUID, IsInt, Min, Matches } from 'class-validator';

export class CreateProductionRequirementDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date: string;

  @IsUUID('4')
  partId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

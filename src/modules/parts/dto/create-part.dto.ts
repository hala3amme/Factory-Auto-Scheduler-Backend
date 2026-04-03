import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  IsUUID,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SkillRequirementDto {
  @IsUUID('4')
  skillId: string;

  @IsInt()
  @Min(1)
  minutesPerUnit: number;
}

export class CreatePartDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SkillRequirementDto)
  skillRequirements: SkillRequirementDto[];
}

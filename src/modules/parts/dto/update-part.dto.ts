import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SkillRequirementDto } from './create-part.dto';

export class UpdatePartDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SkillRequirementDto)
  skillRequirements?: SkillRequirementDto[];
}

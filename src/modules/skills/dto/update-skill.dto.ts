import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class UpdateSkillDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MinLength(2)
  name?: string;
}

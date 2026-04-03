import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;
}

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  skillIds?: string[];
}

import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsUUID,
  ArrayNotEmpty,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  skillIds: string[];
}

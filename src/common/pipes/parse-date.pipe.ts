import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseDatePipe implements PipeTransform<string, string> {
  private readonly DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  transform(value: string): string {
    if (!value || !this.DATE_REGEX.test(value)) {
      throw new BadRequestException(
        `Invalid date format: "${value}". Expected YYYY-MM-DD.`,
      );
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date value: "${value}".`);
    }
    return value;
  }
}

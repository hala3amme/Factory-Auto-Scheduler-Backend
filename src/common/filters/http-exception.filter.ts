import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Handle PostgreSQL driver errors
    if (this.isPgError(exception)) {
      const pgErr = exception as Record<string, unknown>;
      if (pgErr.code === '23503') {
        // Foreign key violation
        return response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          timestamp: new Date().toISOString(),
          path: request.url,
          message: `Referenced resource not found. ${pgErr.detail ?? ''}`.trim(),
        });
      }
      if (pgErr.code === '23505') {
        // Unique constraint violation
        return response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          timestamp: new Date().toISOString(),
          path: request.url,
          message: `Resource already exists. ${pgErr.detail ?? ''}`.trim(),
        });
      }
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        typeof message === 'object' && 'message' in (message as object)
          ? (message as { message: string }).message
          : message,
    });
  }

  private isPgError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as Record<string, unknown>).code === 'string'
    );
  }
}

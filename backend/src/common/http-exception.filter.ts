import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Shape: { error: { code, message, details? } }
 * Status code is whatever NestJS gives us (or 500 for unknown).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const { code, message, details } = normalise(payload, status);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({ error: { code, message, details } });
  }
}

function normalise(
  payload: unknown,
  status: number,
): { code: string; message: string; details?: unknown } {
  if (typeof payload === 'string') {
    return { code: defaultCode(status), message: payload };
  }
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    const message =
      typeof p.message === 'string'
        ? p.message
        : Array.isArray(p.message)
          ? (p.message as string[]).join('; ')
          : 'Error';
    return {
      code: typeof p.code === 'string' ? p.code : defaultCode(status),
      message,
      details: p.details,
    };
  }
  return { code: defaultCode(status), message: 'Error' };
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}

import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse } from '@diagnostic/shared';
import { config } from '../config/env';
import { AuthenticatedRequest, logAppError } from './rbac';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const errorCode = err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR';
  const authReq = req as AuthenticatedRequest;
  const isProd = config.env === 'production';

  const _userHint = authReq.user?.email ? ` [user=${authReq.user.email}]` : '';

  if (statusCode >= 500) {
    void logAppError({
      service: 'EXPRESS_API',
      severity: 'ERROR',
      errorCode,
      message: `${err.message || 'Unhandled server error'}${_userHint}`.slice(0, 500),
      endpointOrRoute: `${req.method} ${req.originalUrl}`,
    });
  }

  const safeMessage =
    isProd && statusCode >= 500
      ? 'An unexpected server issue occurred. Please retry or contact Product & Technology support.'
      : err.message || 'An unexpected error occurred';

  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: safeMessage,
      details:
        !isProd && err instanceof AppError && err.details
          ? err.details
          : !isProd && statusCode >= 500
          ? err.stack
          : undefined,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(response);
}

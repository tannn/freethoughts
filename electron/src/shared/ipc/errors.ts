import type { ZodError } from 'zod';
import type { ErrorEnvelope } from './envelope.js';

export const ERROR_CODES = [
  'E_VALIDATION',
  'E_NOT_FOUND',
  'E_CONFLICT',
  'E_OFFLINE',
  'E_PROVIDER',
  'E_UNAUTHORIZED',
  'E_INTERNAL'
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const error = (
  code: ErrorCode,
  message: string,
  details?: unknown
): ErrorEnvelope => ({
  ok: false,
  error: {
    code,
    message,
    ...(details === undefined ? {} : { details })
  }
});

export const validationErrorFromZod = (zodError: ZodError): ErrorEnvelope => {
  const details = zodError.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code
  }));

  return error('E_VALIDATION', 'Payload validation failed', details);
};

export const toErrorEnvelope = (cause: unknown): ErrorEnvelope => {
  if (cause instanceof AppError) {
    return error(cause.code, cause.message, cause.details);
  }

  return error('E_INTERNAL', 'Internal error');
};

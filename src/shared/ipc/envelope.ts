import type { ErrorCode } from './errors.js';

export type SuccessEnvelope<T = unknown> = {
  ok: true;
  data: T;
};

export type ErrorEnvelope = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export type IpcEnvelope<T = unknown> = SuccessEnvelope<T> | ErrorEnvelope;

export const ok = <T>(data: T): SuccessEnvelope<T> => ({ ok: true, data });

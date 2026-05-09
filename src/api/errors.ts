import type { components } from './generated/schema';

type GeneratedErrorResponse = components['schemas']['ErrorResponse'];

export type ErrorResponse = Omit<GeneratedErrorResponse, 'details'> & {
  details?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  readonly details: unknown;
  readonly response: Response;

  constructor(params: {
    status: number;
    message: string;
    errorCode: string | null;
    details: unknown;
    response: Response;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.errorCode = params.errorCode;
    this.details = params.details;
    this.response = params.response;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseErrorResponse(value: unknown): ErrorResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    error_code: typeof value.error_code === 'string' ? value.error_code : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    details: isRecord(value.details) ? value.details : null,
  };
}

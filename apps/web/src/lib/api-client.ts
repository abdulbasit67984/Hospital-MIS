import type { ApiResponse } from '@hospital-mis/shared';
import { webConfig } from '../config.js';

export class ApiClientError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly correlationId: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const requestInit: RequestInit = {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  };
  if (signal !== undefined) {
    requestInit.signal = signal;
  }

  const response = await fetch(`${webConfig.apiBaseUrl}${path}`, requestInit);

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    const error = payload.success
      ? {
          code: 'HTTP_ERROR',
          message: `Request failed with status ${response.status}`,
          correlationId: response.headers.get('x-correlation-id') ?? 'unknown',
        }
      : payload.error;
    throw new ApiClientError(error.message, response.status, error.code, error.correlationId);
  }

  return payload.data;
}

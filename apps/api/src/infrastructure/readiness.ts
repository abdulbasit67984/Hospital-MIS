import type { ApiConfig } from '@hospital-mis/config';
import { pingDatabase } from '@hospital-mis/database';
import { withTimeout } from '@hospital-mis/shared';

export type ReadinessCheck = {
  name: 'mongodb';
  status: 'up' | 'down';
  latencyMs?: number;
  message?: string;
};

export type ReadinessResult = {
  status: 'ready' | 'not_ready';
  checks: ReadinessCheck[];
};

async function runCheck(
  name: ReadinessCheck['name'],
  operation: Promise<{ status: 'up'; latencyMs: number }>,
  timeoutMs: number,
): Promise<ReadinessCheck> {
  try {
    const result = await withTimeout(operation, timeoutMs, name);
    return { name, status: result.status, latencyMs: result.latencyMs };
  } catch (error) {
    return {
      name,
      status: 'down',
      message: error instanceof Error ? error.message : 'Unknown dependency error',
    };
  }
}

export function createReadinessProbe(config: ApiConfig): () => Promise<ReadinessResult> {
  return async () => {
    const checks = [await runCheck('mongodb', pingDatabase(), config.readinessTimeoutMs)];

    return {
      status: checks.every((check) => check.status === 'up') ? 'ready' : 'not_ready',
      checks,
    };
  };
}

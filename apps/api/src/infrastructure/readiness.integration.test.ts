import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadApiConfig } from '@hospital-mis/config';
import { connectDatabase, disconnectDatabase } from '@hospital-mis/database';
import { createReadinessProbe } from './readiness.js';

const shouldRun = process.env['RUN_INFRA_INTEGRATION_TESTS'] === 'true';
const suite = shouldRun ? describe : describe.skip;

suite('infrastructure readiness', () => {
  const config = loadApiConfig();

  beforeAll(async () => {
    await connectDatabase({
      uri: config.mongodbUri,
      appName: config.mongodbAppName,
      serverSelectionTimeoutMs: config.mongodbServerSelectionTimeoutMs,
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('reports MongoDB as ready', async () => {
    const readiness = await createReadinessProbe(config)();
    expect(readiness.status).toBe('ready');
    expect(readiness.checks).toHaveLength(1);
  });
});

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { ApiConfig } from '@hospital-mis/config';
import { createApp } from './app.js';

const config: ApiConfig = {
  nodeEnv: 'test',
  apiPort: 4000,
  mongodbUri: 'mongodb://localhost:27017/test',
  mongodbAppName: 'hospital-mis-test',
  mongodbServerSelectionTimeoutMs: 1000,
  logLevel: 'silent',
  corsOrigins: ['http://localhost:5173'],
  socketIoPath: '/socket.io',
  readinessTimeoutMs: 1000,
};

describe('foundation endpoints', () => {
  it('returns liveness without checking dependencies', async () => {
    const app = createApp({
      config,
      readinessProbe: async () => ({ status: 'ready', checks: [] }),
    });

    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.headers['x-correlation-id']).toBeTypeOf('string');
  });

  it('returns 503 when a dependency is not ready', async () => {
    const app = createApp({
      config,
      readinessProbe: async () => ({
        status: 'not_ready',
        checks: [{ name: 'mongodb', status: 'down', message: 'Unavailable' }],
      }),
    });

    const response = await request(app).get('/api/v1/ready').expect(503);
    expect(response.body.data.status).toBe('not_ready');
  });
});

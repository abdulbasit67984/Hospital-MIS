// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders live foundation status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/health')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                service: 'hospital-mis-api',
                status: 'ok',
                timestamp: '2026-07-14T08:00:00.000Z',
                uptimeSeconds: 12,
              },
              meta: { correlationId: 'test' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              status: 'ready',
              checks: [{ name: 'mongodb', status: 'up', latencyMs: 2 }],
            },
            meta: { correlationId: 'test' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Ready in 2ms')).toBeInTheDocument();
  });
});

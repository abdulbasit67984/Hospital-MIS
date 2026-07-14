import { useQuery } from '@tanstack/react-query';
import { Button, StatusBadge } from '@hospital-mis/ui';
import { Route, Routes } from 'react-router-dom';
import { apiGet } from './lib/api-client.js';

type HealthPayload = {
  service: string;
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
};

type ReadinessPayload = {
  status: 'ready' | 'not_ready';
  checks: Array<{
    name: 'mongodb';
    status: 'up' | 'down';
    latencyMs?: number;
    message?: string;
  }>;
};

export function FoundationDashboard() {
  const health = useQuery({
    queryKey: ['foundation', 'health'],
    queryFn: ({ signal }) => apiGet<HealthPayload>('/health', signal),
  });
  const readiness = useQuery({
    queryKey: ['foundation', 'readiness'],
    queryFn: ({ signal }) => apiGet<ReadinessPayload>('/ready', signal),
  });

  const refresh = () => {
    void health.refetch();
    void readiness.refetch();
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Phase 1 Foundation
          </p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Hospital Management Information System
              </h1>
              <p className="mt-2 max-w-2xl text-slate-600">
                Pure MERN modular monolith using standalone MongoDB and durable workers.
              </p>
            </div>
            <Button onClick={refresh} disabled={health.isFetching || readiness.isFetching}>
              Refresh status
            </Button>
          </div>
        </header>

        <section aria-labelledby="service-health-heading" className="grid gap-4 md:grid-cols-2">
          <h2 id="service-health-heading" className="sr-only">
            Service health
          </h2>
          <StatusCard
            title="Express API"
            status={health.isPending ? 'checking' : health.isSuccess ? 'online' : 'offline'}
            detail={
              health.data
                ? `Uptime ${health.data.uptimeSeconds}s · ${new Date(health.data.timestamp).toLocaleString()}`
                : health.error instanceof Error
                  ? health.error.message
                  : 'Checking API liveness'
            }
          />
          <StatusCard
            title="Standalone MongoDB"
            status={dependencyStatus(readiness.data, 'mongodb', readiness.isPending)}
            detail={dependencyDetail(readiness.data, 'mongodb')}
          />
        </section>

        <section className="rounded-2xl bg-slate-950 p-6 text-slate-100 shadow-sm">
          <h2 className="text-lg font-semibold">Foundation constraints</h2>
          <ul className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
            <li>MongoDB runs as a standalone Community Server instance.</li>
            <li>No native multi-document transaction dependency.</li>
            <li>Realtime delivery uses Socket.IO with polling fallback.</li>
            <li>Application transactions and recovery arrive in Phase 3.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function StatusCard({
  title,
  status,
  detail,
}: {
  title: string;
  status: 'online' | 'offline' | 'checking';
  detail: string;
}) {
  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <StatusBadge status={status}>
          {status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking'}
        </StatusBadge>
      </div>
      <p className="mt-4 min-h-10 text-sm text-slate-600">{detail}</p>
    </article>
  );
}

function dependencyStatus(
  readiness: ReadinessPayload | undefined,
  name: 'mongodb',
  pending: boolean,
): 'online' | 'offline' | 'checking' {
  if (pending) return 'checking';
  const check = readiness?.checks.find((candidate) => candidate.name === name);
  return check?.status === 'up' ? 'online' : 'offline';
}

function dependencyDetail(readiness: ReadinessPayload | undefined, name: 'mongodb'): string {
  const check = readiness?.checks.find((candidate) => candidate.name === name);
  if (check === undefined) return 'Waiting for readiness result';
  if (check.status === 'up') return `Ready in ${check.latencyMs ?? 0}ms`;
  return check.message ?? 'Dependency is unavailable';
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<FoundationDashboard />} />
    </Routes>
  );
}

import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = Readonly<{
  correlationId: string;
  actorUserId?: string;
  facilityId?: string;
}>;

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function requireRequestContext(): RequestContext {
  const context = getRequestContext();

  if (context === undefined) {
    throw new Error('Request context is not available');
  }

  return context;
}
import { z } from 'zod';

const webEnvironmentSchema = z.object({
  VITE_API_BASE_URL: z.string().default('/api/v1'),
  VITE_SOCKET_URL: z.string().default(window.location.origin),
  VITE_SOCKET_PATH: z.string().startsWith('/').default('/socket.io'),
});

const parsed = webEnvironmentSchema.parse(import.meta.env);

export const webConfig = {
  apiBaseUrl: parsed.VITE_API_BASE_URL.replace(/\/$/, ''),
  socketUrl: parsed.VITE_SOCKET_URL,
  socketPath: parsed.VITE_SOCKET_PATH,
} as const;

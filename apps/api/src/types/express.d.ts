import type { ParsedHttpRequest } from '@hospital-mis/validation';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      validated: ParsedHttpRequest;
    }
  }
}

export {};
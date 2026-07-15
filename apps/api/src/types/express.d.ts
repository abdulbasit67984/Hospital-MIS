import type {
  ParsedHttpRequest,
} from '@hospital-mis/validation';

import type {
  AuthenticatedPrincipal,
} from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      validated: ParsedHttpRequest;
      auth?: AuthenticatedPrincipal;
    }
  }
}

export {};
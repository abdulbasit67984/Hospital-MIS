import {
  z,
} from 'zod';

import {
  objectIdStringSchema,
} from '@hospital-mis/validation';

export const loginRequestSchema =
  z
    .object({
      facilityId:
        objectIdStringSchema,

      login:
        z
          .string()
          .trim()
          .min(1)
          .max(254),

      password:
        z
          .string()
          .min(1)
          .max(128),
    })
    .strict();

export const revokeSessionParamsSchema =
  z
    .object({
      sessionId:
        z.string().uuid(),
    })
    .strict();
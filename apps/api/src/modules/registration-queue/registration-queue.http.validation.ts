import {
  z,
} from 'zod';

const idempotencyKeySchema =
  z
    .string()
    .trim()
    .min(8)
    .max(200)
    .regex(
      /^[A-Za-z0-9._:-]+$/u,
      'Use letters, numbers, periods, underscores, colons, or hyphens',
    );

export const registrationQueueMutationHeadersSchema =
  z.object({
    'idempotency-key':
      idempotencyKeySchema,
  });

export type RegistrationQueueMutationHeaders =
  z.infer<
    typeof registrationQueueMutationHeadersSchema
  >;
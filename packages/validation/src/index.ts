import { z } from 'zod';

export * from './http.js';

export const correlationIdSchema = z
  .string()
  .uuid();

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(
    16,
    'Idempotency key must contain at least 16 characters',
  )
  .max(
    128,
    'Idempotency key cannot exceed 128 characters',
  );

export const objectIdStringSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'Invalid ObjectId',
  );

export const cnicSchema = z
  .string()
  .regex(
    /^\d{13}$/,
    'CNIC must contain exactly 13 digits',
  );

export const bFormSchema = z
  .string()
  .regex(
    /^\d{13}$/,
    'B-Form number must contain exactly 13 digits',
  );

export const moneyStringSchema = z
  .string()
  .regex(
    /^-?\d+(?:\.\d{1,4})?$/,
    'Money must be a decimal string with at most four decimal places',
  );

export const positiveMoneyStringSchema = moneyStringSchema.refine(
  (value) => !value.startsWith('-'),
  'Money amount cannot be negative',
);

export const utcDateTimeStringSchema = z
  .string()
  .datetime({
    offset: true,
  });

export const paginationLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .default(25);

export const sortDirectionSchema = z.enum([
  'asc',
  'desc',
]);
import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import type {
  OpdVisitStatus,
  QueueEntryStatus,
  QueuePriorityClass,
  TriagePriority,
} from '@hospital-mis/database';

export const REGISTRATION_QUEUE_PERMISSION_KEYS = {
  REGISTRATION_READ:
    'registrations.read',

  REGISTRATION_CREATE:
    'registrations.create',

  REGISTRATION_COLLECT_PAYMENT:
    'registrations.collect_payment',

  QUEUE_READ:
    'queues.read',

  QUEUE_MANAGE:
    'queues.manage',

  QUEUE_PRIORITY:
    'queues.priority',

  QUEUE_TRANSFER:
    'queues.transfer',

  QUEUE_PUBLIC_DISPLAY:
    'queues.public_display',
} as const satisfies Record<
  string,
  PermissionKey
>;

export type RegistrationQueuePermissionKey =
  (typeof REGISTRATION_QUEUE_PERMISSION_KEYS)[keyof typeof REGISTRATION_QUEUE_PERMISSION_KEYS];

export const REGISTRATION_SORT_FIELDS = [
  'serviceDate',
  'arrivedAt',
  'createdAt',
  'updatedAt',
] as const;

export type RegistrationSortField =
  (typeof REGISTRATION_SORT_FIELDS)[number];

export const OPD_VISIT_SORT_FIELDS = [
  'serviceDate',
  'arrivedAt',
  'checkedInAt',
  'createdAt',
  'updatedAt',
] as const;

export type OpdVisitSortField =
  (typeof OPD_VISIT_SORT_FIELDS)[number];

export const QUEUE_ENTRY_SORT_FIELDS = [
  'queuedAt',
  'priorityScore',
  'tokenNumber',
  'lastStatusChangedAt',
] as const;

export type QueueEntrySortField =
  (typeof QUEUE_ENTRY_SORT_FIELDS)[number];

export const DEFAULT_REGISTRATION_QUEUE_PAGE_SIZE =
  25;

export const MAX_REGISTRATION_QUEUE_PAGE_SIZE =
  100;

export const DEFAULT_REGISTRATION_NUMBER_WIDTH =
  6;

export const DEFAULT_VISIT_NUMBER_WIDTH =
  6;

export const REGISTRATION_NUMBER_SEQUENCE_NAMESPACE =
  'registration.number';

export const OPD_VISIT_NUMBER_SEQUENCE_NAMESPACE =
  'opd.visit.number';

export const OPD_QUEUE_TOKEN_SEQUENCE_NAMESPACE =
  'opd.queue.token';

export const REGISTRATION_QUEUE_LOCK_NAMESPACE = {
  ACTIVE_VISIT:
    'registration-queue:active-visit',

  REGISTRATION_NUMBER:
    'registration-queue:registration-number',

  VISIT_NUMBER:
    'registration-queue:visit-number',

  QUEUE_TOKEN:
    'registration-queue:queue-token',

  QUEUE_ENTRY:
    'registration-queue:queue-entry',

  QUEUE_TRANSFER:
    'registration-queue:queue-transfer',
} as const;

export const QUEUE_PRIORITY_CLASS_SCORE = {
  ROUTINE:
    0,

  PRIORITY:
    1_000,

  URGENT:
    5_000,

  EMERGENCY:
    20_000,
} as const satisfies Record<
  QueuePriorityClass,
  number
>;

export const TRIAGE_PRIORITY_SCORE = {
  NOT_TRIAGED:
    0,

  LEVEL_5_NON_URGENT:
    100,

  LEVEL_4_LESS_URGENT:
    500,

  LEVEL_3_URGENT:
    2_000,

  LEVEL_2_EMERGENT:
    10_000,

  LEVEL_1_RESUSCITATION:
    50_000,
} as const satisfies Record<
  TriagePriority,
  number
>;

export const EMERGENCY_OVERRIDE_SCORE =
  100_000;

export const SPECIAL_CATEGORY_PRIORITY_SCORE =
  100;

export const OPD_VISIT_TRANSITIONS = {
  REGISTERED: [
    'CHECKED_IN',
    'QUEUED',
    'CANCELLED',
    'NO_SHOW',
    'CORRECTED',
  ],

  CHECKED_IN: [
    'QUEUED',
    'IN_SERVICE',
    'CANCELLED',
    'NO_SHOW',
    'CORRECTED',
  ],

  QUEUED: [
    'IN_SERVICE',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
    'CORRECTED',
  ],

  IN_SERVICE: [
    'COMPLETED',
    'CANCELLED',
    'CORRECTED',
  ],

  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  CORRECTED: [],
} as const satisfies Record<
  OpdVisitStatus,
  readonly OpdVisitStatus[]
>;

export const QUEUE_ENTRY_TRANSITIONS = {
  WAITING: [
    'CALLED',
    'SKIPPED',
    'TRANSFERRED',
    'CANCELLED',
    'NO_SHOW',
  ],

  CALLED: [
    'SERVING',
    'SKIPPED',
    'TRANSFERRED',
    'CANCELLED',
    'NO_SHOW',
  ],

  SERVING: [
    'COMPLETED',
    'TRANSFERRED',
    'CANCELLED',
  ],

  SKIPPED: [
    'WAITING',
    'CALLED',
    'TRANSFERRED',
    'CANCELLED',
    'NO_SHOW',
  ],

  TRANSFERRED: [],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
} as const satisfies Record<
  QueueEntryStatus,
  readonly QueueEntryStatus[]
>;

export const ACTIVE_OPD_VISIT_STATUSES = [
  'REGISTERED',
  'CHECKED_IN',
  'QUEUED',
  'IN_SERVICE',
] as const satisfies readonly OpdVisitStatus[];

export const ACTIVE_QUEUE_ENTRY_STATUSES = [
  'WAITING',
  'CALLED',
  'SERVING',
  'SKIPPED',
] as const satisfies readonly QueueEntryStatus[];
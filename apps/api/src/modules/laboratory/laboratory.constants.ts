import type {
  LaboratoryOrderStatus,
  LaboratoryResultPublicationStatus,
  LaboratoryResultStatus,
  LaboratorySpecimenStatus,
} from '@hospital-mis/database';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

export const LABORATORY_PERMISSION_KEYS = {
  CATALOG_READ: 'laboratory.catalog.read',
  CATALOG_MANAGE: 'laboratory.catalog.manage',
  ORDERS_READ: 'laboratory.orders.read',
  ORDERS_CREATE: 'laboratory.orders.create',
  ORDERS_MANAGE: 'laboratory.orders.manage',
  ORDERS_CANCEL: 'laboratory.orders.cancel',
  SPECIMENS_READ: 'laboratory.specimens.read',
  SPECIMENS_COLLECT: 'laboratory.specimens.collect',
  SPECIMENS_RECEIVE: 'laboratory.specimens.receive',
  SPECIMENS_REJECT: 'laboratory.specimens.reject',
  RESULTS_READ: 'laboratory.results.read',
  RESULTS_ENTER: 'laboratory.results.enter',
  RESULTS_VALIDATE: 'laboratory.results.validate',
  RESULTS_VERIFY: 'laboratory.results.verify',
  RESULTS_AMEND: 'laboratory.results.amend',
  RESULTS_PUBLISH: 'laboratory.results.publish',
  RESULTS_PRINT: 'laboratory.results.print',
  CRITICAL_NOTIFY: 'laboratory.critical_results.notify',
  CRITICAL_ACKNOWLEDGE: 'laboratory.critical_results.acknowledge',
  BREAK_GLASS: 'security.break_glass',
} as const satisfies Record<string, PermissionKey>;

export const LABORATORY_ORDER_TRANSITIONS = {
  ORDERED: [
    'ACCEPTED',
    'CANCELLED',
  ],
  ACCEPTED: [
    'PARTIALLY_COLLECTED',
    'SAMPLE_COLLECTED',
    'IN_PROGRESS',
    'CANCELLED',
  ],
  PARTIALLY_COLLECTED: [
    'SAMPLE_COLLECTED',
    'RECOLLECTION_REQUIRED',
    'CANCELLED',
  ],
  SAMPLE_COLLECTED: [
    'IN_PROGRESS',
    'RECOLLECTION_REQUIRED',
    'CANCELLED',
  ],
  IN_PROGRESS: [
    'PARTIALLY_COMPLETED',
    'COMPLETED',
    'RECOLLECTION_REQUIRED',
    'CANCELLED',
  ],
  PARTIALLY_COMPLETED: [
    'COMPLETED',
    'RECOLLECTION_REQUIRED',
    'CANCELLED',
  ],
  COMPLETED: [
    'VERIFIED',
  ],
  VERIFIED: [],
  RECOLLECTION_REQUIRED: [
    'PARTIALLY_COLLECTED',
    'SAMPLE_COLLECTED',
    'CANCELLED',
  ],
  CANCELLED: [],
} as const satisfies Record<
  LaboratoryOrderStatus,
  readonly LaboratoryOrderStatus[]
>;

export const LABORATORY_SPECIMEN_TRANSITIONS = {
  PLANNED: [
    'LABEL_PRINTED',
    'COLLECTED',
    'CANCELLED',
  ],
  LABEL_PRINTED: [
    'COLLECTED',
    'CANCELLED',
  ],
  COLLECTED: [
    'RECEIVED',
    'REJECTED',
    'RECOLLECTION_REQUIRED',
    'CANCELLED',
  ],
  RECEIVED: [
    'PROCESSING',
    'REJECTED',
    'RECOLLECTION_REQUIRED',
    'CANCELLED',
  ],
  PROCESSING: [
    'COMPLETED',
    'REJECTED',
    'RECOLLECTION_REQUIRED',
    'CANCELLED',
  ],
  COMPLETED: [],
  REJECTED: [
    'RECOLLECTION_REQUIRED',
  ],
  RECOLLECTION_REQUIRED: [],
  CANCELLED: [],
} as const satisfies Record<
  LaboratorySpecimenStatus,
  readonly LaboratorySpecimenStatus[]
>;

export const LABORATORY_RESULT_TRANSITIONS = {
  DRAFT: [
    'ENTERED',
    'CANCELLED',
  ],
  ENTERED: [
    'DRAFT',
    'VALIDATED',
    'CANCELLED',
  ],
  VALIDATED: [
    'ENTERED',
    'VERIFIED',
    'CANCELLED',
  ],
  VERIFIED: [
    'CORRECTED',
    'CANCELLED',
  ],
  CORRECTED: [
    'CANCELLED',
  ],
  CANCELLED: [],
} as const satisfies Record<
  LaboratoryResultStatus,
  readonly LaboratoryResultStatus[]
>;

export const LABORATORY_PUBLICATION_TRANSITIONS = {
  NOT_PUBLISHED: [
    'PUBLISHED',
  ],
  PUBLISHED: [
    'WITHDRAWN',
  ],
  WITHDRAWN: [
    'PUBLISHED',
  ],
} as const satisfies Record<
  LaboratoryResultPublicationStatus,
  readonly LaboratoryResultPublicationStatus[]
>;

export const DEFAULT_LABORATORY_PAGE_SIZE = 25;
export const MAX_LABORATORY_PAGE_SIZE = 100;
export const DEFAULT_LABORATORY_NUMBER_WIDTH = 7;

export const LABORATORY_NUMBER_SEQUENCE_NAMESPACE = {
  ORDER: 'laboratory.order.number',
  ACCESSION: 'laboratory.accession.number',
  SPECIMEN: 'laboratory.specimen.number',
  RESULT: 'laboratory.result.number',
} as const;

export const LABORATORY_LOCK_NAMESPACE = {
  CATALOG_CATEGORY: 'laboratory:catalog-category',
  CATALOG_TEST: 'laboratory:catalog-test',
  ENCOUNTER_ORDERS: 'laboratory:encounter-orders',
  ORDER: 'laboratory:order',
  ORDER_ITEM: 'laboratory:order-item',
  SPECIMEN: 'laboratory:specimen',
  RESULT: 'laboratory:result',
  CRITICAL_COMMUNICATION: 'laboratory:critical-communication',
} as const;

export const LABORATORY_CATALOG_SORT_FIELDS = [
  'name',
  'testCode',
  'categoryNameSnapshot',
  'status',
  'updatedAt',
] as const;

export const LABORATORY_ORDER_SORT_FIELDS = [
  'orderedAt',
  'priority',
  'status',
  'updatedAt',
] as const;

export type LaboratoryCatalogSortField =
  (typeof LABORATORY_CATALOG_SORT_FIELDS)[number];

export type LaboratoryOrderSortField =
  (typeof LABORATORY_ORDER_SORT_FIELDS)[number];

export const LABORATORY_EVENT_TYPES = {
  CATALOG_CATEGORY_CREATED: 'laboratory.catalog_category.created.v1',
  CATALOG_CATEGORY_UPDATED: 'laboratory.catalog_category.updated.v1',
  TEST_CREATED: 'laboratory.test.created.v1',
  TEST_UPDATED: 'laboratory.test.updated.v1',
  TEST_STATUS_CHANGED: 'laboratory.test.status_changed.v1',
  ORDER_CREATED: 'laboratory.order.created.v1',
  ORDER_ACCEPTED: 'laboratory.order.accepted.v1',
  ORDER_CANCELLED: 'laboratory.order.cancelled.v1',
  ORDER_STATUS_CHANGED: 'laboratory.order.status_changed.v1',
  SPECIMEN_LABEL_PRINTED: 'laboratory.specimen.label_printed.v1',
  SPECIMEN_STATUS_CHANGED: 'laboratory.specimen.status_changed.v1',
  RESULT_ENTERED: 'laboratory.result.entered.v1',
  RESULT_VALIDATED: 'laboratory.result.validated.v1',
  RESULT_VERIFIED: 'laboratory.result.verified.v1',
  RESULT_CORRECTED: 'laboratory.result.corrected.v1',
  RESULT_PUBLISHED: 'laboratory.result.published.v1',
  RESULT_WITHDRAWN: 'laboratory.result.withdrawn.v1',
  CRITICAL_RESULT_COMMUNICATION_RECORDED:
    'laboratory.critical_result.communication_recorded.v1',
} as const;

export const LABORATORY_TRANSACTION_TYPES = {
  CREATE_CATEGORY: 'LABORATORY_CATEGORY_CREATE',
  UPDATE_CATEGORY: 'LABORATORY_CATEGORY_UPDATE',
  CREATE_TEST: 'LABORATORY_TEST_CREATE',
  UPDATE_TEST: 'LABORATORY_TEST_UPDATE',
  CHANGE_TEST_STATUS: 'LABORATORY_TEST_STATUS_CHANGE',
  CREATE_ORDER: 'LABORATORY_ORDER_CREATE',
  ACCEPT_ORDER: 'LABORATORY_ORDER_ACCEPT',
  CANCEL_ORDER: 'LABORATORY_ORDER_CANCEL',
  PRINT_SPECIMEN_LABEL: 'LABORATORY_SPECIMEN_LABEL_PRINT',
  COLLECT_SPECIMEN: 'LABORATORY_SPECIMEN_COLLECT',
  RECEIVE_SPECIMEN: 'LABORATORY_SPECIMEN_RECEIVE',
  REJECT_SPECIMEN: 'LABORATORY_SPECIMEN_REJECT',
  REQUEST_RECOLLECTION: 'LABORATORY_SPECIMEN_RECOLLECTION_REQUEST',
  ENTER_RESULT: 'LABORATORY_RESULT_ENTER',
  VALIDATE_RESULT: 'LABORATORY_RESULT_VALIDATE',
  VERIFY_RESULT: 'LABORATORY_RESULT_VERIFY',
  CORRECT_RESULT: 'LABORATORY_RESULT_CORRECT',
  PUBLISH_RESULT: 'LABORATORY_RESULT_PUBLISH',
  WITHDRAW_RESULT: 'LABORATORY_RESULT_WITHDRAW',
  RECORD_CRITICAL_COMMUNICATION:
    'LABORATORY_CRITICAL_COMMUNICATION_RECORD',
  PRINT_REPORT: 'LABORATORY_RESULT_REPORT_PRINT',
} as const;
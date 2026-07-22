import {
  Router,
  type RequestHandler,
} from 'express';

import {
  z,
} from 'zod';

import type {
  PermissionKey,
} from '@hospital-mis/permissions';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  validateRequest,
} from '../../middleware/validate-request.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import {
  requirePermission,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  PanelsPackagesCoverageApplication,
} from './panels-packages-coverage.application.js';

import {
  PanelsPackagesCoverageController,
} from './panels-packages-coverage.controller.js';

import {
  changePackageStatusSchema,
  changePanelStatusSchema,
  createCoveragePlanSchema,
  createPanelSchema,
  createPayerOrganizationSchema,
  enrollPatientCoverageSchema,
  enrollPatientPackageSchema,
  estimateCoverageSchema,
  ppcExpectedVersionSchema,
  ppcNonNegativeDecimalSchema,
  ppcObjectIdSchema,
  ppcReasonSchema,
  reservePackageUtilizationSchema,
} from './panels-packages-coverage.validation.js';

const idempotencyHeaders = z
  .object({
    'idempotency-key': z.string().trim().min(8).max(240),
  })
  .passthrough();

const reportQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  patientId: ppcObjectIdSchema.optional(),
  payerOrganizationId: ppcObjectIdSchema.optional(),
  status: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1_000).default(50),
  async: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

const verifyCoverageSchema = z.object({
  expectedVersion: ppcExpectedVersionSchema,
  verifiedEligible: z.boolean(),
  verifiedFrom: z.string().datetime({ offset: true }),
  verifiedThrough: z
    .string()
    .datetime({ offset: true })
    .nullable(),
  verificationReference: z.string().trim().max(240).nullable(),
  reason: ppcReasonSchema,
});

const reverseUtilizationSchema = z.object({
  expectedVersion: ppcExpectedVersionSchema,
  reason: ppcReasonSchema,
  refundId: ppcObjectIdSchema.nullable().optional(),
  creditNoteId: ppcObjectIdSchema.nullable().optional(),
});

const determinationBodySchema = estimateCoverageSchema.extend({
  estimationId: ppcObjectIdSchema,
  expectedInvoiceVersion: ppcExpectedVersionSchema,
});

const overrideDeterminationSchema = z.object({
  expectedVersion: ppcExpectedVersionSchema,
  expectedInvoiceVersion: ppcExpectedVersionSchema,
  sponsorAmount: ppcNonNegativeDecimalSchema,
  patientAmount: ppcNonNegativeDecimalSchema,
  authorizationReference: z.string().trim().min(3).max(240),
  reason: ppcReasonSchema,
});

const reverseDeterminationSchema = z.object({
  expectedVersion: ppcExpectedVersionSchema,
  expectedInvoiceVersion: ppcExpectedVersionSchema,
  reason: ppcReasonSchema,
});

const changeCoveragePlanStatusSchema = z.object({
  expectedVersion: ppcExpectedVersionSchema,
  status: z.enum([
    'DRAFT',
    'ACTIVE',
    'SUSPENDED',
    'EXPIRED',
    'RETIRED',
  ]),
  reason: ppcReasonSchema,
});

const refundEffectsSchema = z.object({
  refundId: ppcObjectIdSchema,
  invoiceId: ppcObjectIdSchema,
  packageUtilizationIds: z.array(ppcObjectIdSchema).max(1_000),
  coverageUtilizationIds: z.array(ppcObjectIdSchema).max(1_000),
  reason: ppcReasonSchema,
});

export const PANELS_PACKAGES_COVERAGE_ROUTE_MANIFEST = [
  ['POST', '/panels', 'panels.manage'],
  ['POST', '/panels/:panelId/status', 'panels.activate'],
  ['POST', '/treatment-packages/:packageId/status', 'packages.activate'],
  ['POST', '/coverage-plans/:planId/status', 'coverage.activate'],
  ['POST', '/payers', 'coverage.manage'],
  ['POST', '/coverage-plans', 'coverage.manage'],
  ['POST', '/patient-coverages', 'coverage.enroll'],
  [
    'POST',
    '/patient-coverages/:coverageId/verify',
    'coverage.verify',
  ],
  ['POST', '/package-enrollments', 'packages.enroll'],
  ['POST', '/package-utilizations', 'packages.enroll'],
  [
    'POST',
    '/package-utilizations/:utilizationId/reverse',
    'packages.reverse',
  ],
  ['POST', '/coverage/estimate', 'coverage.estimate'],
  ['POST', '/coverage/determine', 'coverage.determine'],
  [
    'POST',
    '/coverage-determinations/:determinationId/override',
    'coverage.override',
  ],
  [
    'POST',
    '/coverage-determinations/:determinationId/reverse',
    'coverage.override',
  ],
  ['POST', '/refund-effects', 'packages.reverse'],
  [
    'GET',
    '/reports/package-utilization',
    'coverage.reports.read',
  ],
  [
    'GET',
    '/reports/coverage-utilization',
    'coverage.reports.read',
  ],
  [
    'GET',
    '/reports/benefit-balances',
    'coverage.reports.read',
  ],
  [
    'GET',
    '/reports/:report.csv',
    'coverage.reports.export',
  ],
  ['POST', '/recovery/run', 'coverage.override'],
] as const;

export function createPanelsPackagesCoverageRouter(
  options: Readonly<{
    application: PanelsPackagesCoverageApplication;
    authenticationService: AuthenticationService;
    authorizationService: AuthorizationService;
  }>,
): Router {
  const router = Router();
  const controller = new PanelsPackagesCoverageController(
    options.application,
    options.authorizationService,
  );

  router.use(authenticate(options.authenticationService));

  const mutation = (
    path: string,
    permission: PermissionKey,
    schema: Parameters<typeof validateRequest>[0],
    handler: RequestHandler,
  ) =>
    router.post(
      path,
      validateRequest({
        headers: idempotencyHeaders,
        ...schema,
      }),
      requirePermission(options.authorizationService, permission),
      handler,
    );

  const read = (
    path: string,
    permission: PermissionKey,
    schema: Parameters<typeof validateRequest>[0],
    handler: RequestHandler,
  ) =>
    router.get(
      path,
      validateRequest(schema),
      requirePermission(options.authorizationService, permission),
      handler,
    );

  mutation(
    '/panels',
    'panels.manage',
    {
      body: createPanelSchema.extend({
        priceListId: ppcObjectIdSchema,
      }),
    },
    controller.createPanel,
  );

  mutation(
    '/panels/:panelId/status',
    'panels.activate',
    {
      params: z.object({
        panelId: ppcObjectIdSchema,
      }),
      body: changePanelStatusSchema,
    },
    controller.changePanelStatus,
  );

  mutation(
    '/treatment-packages/:packageId/status',
    'packages.activate',
    {
      params: z.object({
        packageId: ppcObjectIdSchema,
      }),
      body: changePackageStatusSchema,
    },
    controller.changePackageStatus,
  );

  mutation(
    '/coverage-plans/:planId/status',
    'coverage.activate',
    {
      params: z.object({
        planId: ppcObjectIdSchema,
      }),
      body: changeCoveragePlanStatusSchema,
    },
    controller.changeCoveragePlanStatus,
  );

  mutation(
    '/payers',
    'coverage.manage',
    {
      body: createPayerOrganizationSchema,
    },
    controller.createPayer,
  );

  mutation(
    '/coverage-plans',
    'coverage.manage',
    {
      body: createCoveragePlanSchema,
    },
    controller.createCoveragePlan,
  );

  mutation(
    '/patient-coverages',
    'coverage.enroll',
    {
      body: enrollPatientCoverageSchema,
    },
    controller.enrollCoverage,
  );

  mutation(
    '/patient-coverages/:coverageId/verify',
    'coverage.verify',
    {
      params: z.object({
        coverageId: ppcObjectIdSchema,
      }),
      body: verifyCoverageSchema,
    },
    controller.verifyCoverage,
  );

  mutation(
    '/package-enrollments',
    'packages.enroll',
    {
      body: enrollPatientPackageSchema,
    },
    controller.enrollPackage,
  );

  mutation(
    '/package-utilizations',
    'packages.enroll',
    {
      body: reservePackageUtilizationSchema
        .omit({
          idempotencyKey: true,
        })
        .extend({
          expectedBalanceVersion: ppcExpectedVersionSchema,
        }),
    },
    controller.reservePackage,
  );

  mutation(
    '/package-utilizations/:utilizationId/reverse',
    'packages.reverse',
    {
      params: z.object({
        utilizationId: ppcObjectIdSchema,
      }),
      body: reverseUtilizationSchema,
    },
    controller.reversePackage,
  );

  mutation(
    '/coverage/estimate',
    'coverage.estimate',
    {
      body: estimateCoverageSchema,
    },
    controller.estimateCoverage,
  );

  mutation(
    '/coverage/determine',
    'coverage.determine',
    {
      body: determinationBodySchema,
    },
    controller.determineCoverage,
  );

  mutation(
    '/coverage-determinations/:determinationId/override',
    'coverage.override',
    {
      params: z.object({
        determinationId: ppcObjectIdSchema,
      }),
      body: overrideDeterminationSchema,
    },
    controller.overrideDetermination,
  );

  mutation(
    '/coverage-determinations/:determinationId/reverse',
    'coverage.override',
    {
      params: z.object({
        determinationId: ppcObjectIdSchema,
      }),
      body: reverseDeterminationSchema,
    },
    controller.reverseDetermination,
  );

  mutation(
    '/refund-effects',
    'packages.reverse',
    {
      body: refundEffectsSchema,
    },
    controller.applyRefundEffects,
  );

  read(
    '/reports/package-utilization',
    'coverage.reports.read',
    {
      query: reportQuerySchema,
    },
    controller.packageUtilizationReport,
  );

  read(
    '/reports/coverage-utilization',
    'coverage.reports.read',
    {
      query: reportQuerySchema,
    },
    controller.coverageUtilizationReport,
  );

  read(
    '/reports/benefit-balances',
    'coverage.reports.read',
    {
      query: reportQuerySchema,
    },
    controller.benefitBalanceReport,
  );

  read(
    '/reports/:report.csv',
    'coverage.reports.export',
    {
      params: z.object({
        report: z.enum([
          'package-utilization',
          'coverage-utilization',
          'benefit-balances',
        ]),
      }),
      query: reportQuerySchema,
    },
    controller.exportReport,
  );

  mutation(
    '/recovery/run',
    'coverage.override',
    {
      body: z.object({
        limit: z.number().int().min(1).max(500).default(100),
      }),
    },
    controller.runRecovery,
  );

  return router;
}
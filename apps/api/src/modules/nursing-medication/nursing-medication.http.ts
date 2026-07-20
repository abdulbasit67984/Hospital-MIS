import type {
  Request,
  RequestHandler,
  Response,
  Router as ExpressRouter,
} from 'express';

import {
  Router,
} from 'express';

import {
  z,
} from 'zod';

import {
  BadRequestError,
  ResourceNotFoundError,
  UnauthorizedError,
  createApiSuccess,
} from '@hospital-mis/shared';

import {
  authenticate,
} from '../../middleware/authenticate.js';

import {
  validateRequest,
} from '../../middleware/validate-request.js';

import {
  requirePermission,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  AuthenticationService,
} from '../auth/auth.service.js';

import type {
  AuthenticatedPrincipal,
} from '../auth/auth.types.js';

import type {
  NursingMedicationActorContext,
} from './nursing-medication.contracts.js';

import type {
  NursingMedicationApplication,
} from './nursing-medication.application.js';

import {
  createNursingAssessmentBodySchema,
  signNursingAssessmentBodySchema,
  correctNursingAssessmentBodySchema,
  markNursingAssessmentEnteredInErrorBodySchema,
  createNursingCarePlanBodySchema,
  reviewNursingCarePlanBodySchema,
  completeNursingCarePlanBodySchema,
  cancelNursingCarePlanBodySchema,
  correctNursingCarePlanBodySchema,
  createNursingTaskBodySchema,
  changeNursingTaskStatusBodySchema,
  carryForwardNursingTaskBodySchema,
  recordIntakeOutputBodySchema,
  correctIntakeOutputBodySchema,
  markIntakeOutputEnteredInErrorBodySchema,
  createNursingDeviceBodySchema,
  recordNursingDeviceObservationBodySchema,
  removeNursingDeviceBodySchema,
} from './nursing-medication.validation.js';

import {
  correctNursingVitalObservationBodySchema,
  correctWardHandoverBodySchema,
  enterNursingVitalObservationInErrorBodySchema,
  enterWardHandoverInErrorBodySchema,
  nursingVitalMeasurementBodySchema,
  nursingVitalTrendQuerySchema,
  wardHandoverListQuerySchema,
} from './nursing-observation.validation.js';

import {
  changeMedicationAdministrationScheduleStatusBodySchema,
  correctMedicationAdministrationBodySchema,
  createMedicationAdministrationScheduleBodySchema,
  enterMedicationAdministrationInErrorBodySchema,
  medicationAdministrationHistoryQuerySchema,
  medicationComplianceQuerySchema,
  medicationDueBoardQuerySchema,
  recordMedicationAdministrationBodySchema,
} from './medication-administration.validation.js';

const objectIdSchema =
  z
    .string()
    .regex(
      /^[a-f\d]{24}$/iu,
      'Expected a valid MongoDB ObjectId',
    );

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

const mutationHeadersSchema =
  z
    .object({
      'idempotency-key':
        idempotencyKeySchema,

      'x-break-glass-reason': z
        .string()
        .trim()
        .min(10)
        .max(1_000)
        .optional(),
    })
    .passthrough();

const readHeadersSchema =
  z
    .object({
      'x-break-glass-reason': z
        .string()
        .trim()
        .min(10)
        .max(1_000)
        .optional(),
    })
    .passthrough();

const entityParamsSchema =
  z
    .object({
      assessmentId:
        objectIdSchema.optional(),
      carePlanId:
        objectIdSchema.optional(),
      taskId:
        objectIdSchema.optional(),
      vitalSignId:
        objectIdSchema.optional(),
      entryId:
        objectIdSchema.optional(),
      deviceId:
        objectIdSchema.optional(),
      handoverId:
        objectIdSchema.optional(),
      scheduleId:
        objectIdSchema.optional(),
      administrationId:
        objectIdSchema.optional(),
    })
    .strict();


const enterNursingVitalObservationInErrorHttpBodySchema =
  enterNursingVitalObservationInErrorBodySchema
    .extend({
      admissionId:
        objectIdSchema,
    })
    .strict();

const fluidBalanceQuerySchema =
  z
    .object({
      admissionId:
        objectIdSchema,
      from:
        z.string().datetime({
          offset:
            true,
        }),
      to:
        z.string().datetime({
          offset:
            true,
        }),
    })
    .strict();

function validated<T>(
  request: Request,
  location:
    | 'params'
    | 'query'
    | 'body'
    | 'headers',
): T {
  const value =
    request.validated[
      location
    ];

  if (
    value ===
    undefined
  ) {
    throw new BadRequestError(
      `Validated nursing request ${location} is unavailable`,
    );
  }

  return value as T;
}

function requirePrincipal(
  request: Request,
): AuthenticatedPrincipal {
  if (
    request.auth ===
    undefined
  ) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

async function actorFromRequest(
  request: Request,
  authorization: AuthorizationService,
): Promise<NursingMedicationActorContext> {
  const principal =
    requirePrincipal(
      request,
    );

  const permissions =
    await authorization.permissionsFor(
      principal,
    );

  const headers =
    request.validated.headers as
      | {
          'x-break-glass-reason'?: string;
        }
      | undefined;

  const breakGlassReason =
    headers?.[
      'x-break-glass-reason'
    ] ??
    request.header(
      'x-break-glass-reason',
    );

  const userAgent =
    request.header(
      'user-agent',
    );

  return {
    userId:
      principal.userId,
    facilityId:
      principal.facilityId,
    correlationId:
      request.correlationId,
    roleKeys:
      [],
    permissionKeys: [
      ...permissions,
    ],
    ...(request.ip.length ===
    0
      ? {}
      : {
          ipAddress:
            request.ip,
        }),
    ...(userAgent ===
    undefined
      ? {}
      : {
          userAgent,
        }),
    ...(breakGlassReason ===
    undefined
      ? {}
      : {
          breakGlassReason,
        }),
  };
}

function idempotencyKey(
  request: Request,
): string {
  return validated<{
    'idempotency-key': string;
  }>(
    request,
    'headers',
  )[
    'idempotency-key'
  ];
}

function parameter(
  request: Request,
  key: string,
): string {
  const value =
    validated<Record<string, string | undefined>>(
      request,
      'params',
    )[
      key
    ];

  if (
    value ===
    undefined
  ) {
    throw new ResourceNotFoundError(
      `Nursing route parameter ${key} is unavailable`,
    );
  }

  return value;
}

class NursingMedicationController {
  public constructor(
    private readonly application:
      NursingMedicationApplication,
    private readonly authorization:
      AuthorizationService,
  ) {}

  private async actor(
    request: Request,
  ) {
    return actorFromRequest(
      request,
      this.authorization,
    );
  }

  private send(
    request: Request,
    response: Response,
    status: number,
    result: unknown,
  ): void {
    response
      .status(
        status,
      )
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  }

  private mutation =
    async (
      request: Request,
    ) => ({
      actor:
        await this.actor(
          request,
        ),
      idempotencyKey:
        idempotencyKey(
          request,
        ),
    });

  public createAssessment = async (
    request: Request,
    response: Response,
  ) => {
    this.send(
      request,
      response,
      201,
      await this.application.workflows.createAssessment.execute({
        ...await this.mutation(request),
        input:
          validated(request, 'body'),
      } as never),
    );
  };

  public signAssessment = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.signAssessment.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'assessmentId'),
      input: validated(request, 'body'),
    } as never));
  };

  public correctAssessment = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.correctAssessment.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'assessmentId'),
      input: validated(request, 'body'),
    } as never));
  };

  public enterAssessmentInError = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.enterAssessmentInError.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'assessmentId'),
      input: validated(request, 'body'),
    } as never));
  };

  public createCarePlan = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.createCarePlan.execute({
      ...await this.mutation(request),
      input: validated(request, 'body'),
    } as never));
  };

  public reviewCarePlan = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.reviewCarePlan.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'carePlanId'),
      input: validated(request, 'body'),
    } as never));
  };

  public completeCarePlan = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.completeCarePlan.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'carePlanId'),
      input: validated(request, 'body'),
    } as never));
  };

  public cancelCarePlan = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.cancelCarePlan.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'carePlanId'),
      input: validated(request, 'body'),
    } as never));
  };

  public correctCarePlan = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.correctCarePlan.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'carePlanId'),
      input: validated(request, 'body'),
    } as never));
  };

  public createTask = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.createTask.execute({
      ...await this.mutation(request),
      input: validated(request, 'body'),
    } as never));
  };

  public changeTaskStatus = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.changeTaskStatus.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'taskId'),
      input: validated(request, 'body'),
    } as never));
  };

  public carryForwardTask = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.carryForwardTask.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'taskId'),
      input: validated(request, 'body'),
    } as never));
  };

  public recordVital = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.recordVitalObservation.execute({
      ...await this.mutation(request),
      input: validated(request, 'body'),
    } as never));
  };

  public correctVital = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.correctVitalObservation.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'vitalSignId'),
      input: validated(request, 'body'),
    } as never));
  };

  public enterVitalInError = async (request: Request, response: Response) => {
    const body = validated<Record<string, unknown>>(request, 'body');
    this.send(request, response, 200, await this.application.workflows.enterVitalObservationInError.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'vitalSignId'),
      admissionId: String(body.admissionId),
      input: body,
    } as never));
  };

  public listVitalTrend = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.listVitalTrend.execute(
      await this.actor(request),
      validated(request, 'query'),
    ));
  };

  public recordIntakeOutput = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.recordIntakeOutput.execute({
      ...await this.mutation(request),
      input: validated(request, 'body'),
    } as never));
  };

  public correctIntakeOutput = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.correctIntakeOutput.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'entryId'),
      input: validated(request, 'body'),
    } as never));
  };

  public enterIntakeOutputInError = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.enterIntakeOutputInError.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'entryId'),
      input: validated(request, 'body'),
    } as never));
  };

  public fluidBalance = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.calculateFluidBalance.execute(
      await this.actor(request),
      validated(request, 'query'),
    ));
  };

  public createDevice = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.createDevice.execute({
      ...await this.mutation(request),
      input: validated(request, 'body'),
    } as never));
  };

  public recordDeviceObservation = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.recordDeviceObservation.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'deviceId'),
      input: validated(request, 'body'),
    } as never));
  };

  public removeDevice = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.removeDevice.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'deviceId'),
      input: validated(request, 'body'),
    } as never));
  };

  public correctHandover = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.workflows.correctHandover.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'handoverId'),
      input: validated(request, 'body'),
    } as never));
  };

  public enterHandoverInError = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.enterHandoverInError.execute({
      ...await this.mutation(request),
      entityId: parameter(request, 'handoverId'),
      input: validated(request, 'body'),
    } as never));
  };

  public listHandovers = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.workflows.listHandoverWorklist.execute(
      await this.actor(request),
      validated(request, 'query'),
    ));
  };

  public createMedicationSchedule = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.services.medication.createSchedule({
      ...await this.mutation(request),
      input: validated(request, 'body'),
    } as never));
  };

  public changeMedicationScheduleStatus = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.services.medication.changeScheduleStatus({
      ...await this.mutation(request),
      entityId: parameter(request, 'scheduleId'),
      input: validated(request, 'body'),
    } as never));
  };

  public recordMedicationDose = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.services.medication.recordDose({
      ...await this.mutation(request),
      entityId: parameter(request, 'scheduleId'),
      input: validated(request, 'body'),
    } as never));
  };

  public correctMedicationAdministration = async (request: Request, response: Response) => {
    this.send(request, response, 201, await this.application.services.medication.correctAdministration({
      ...await this.mutation(request),
      entityId: parameter(request, 'administrationId'),
      input: validated(request, 'body'),
    } as never));
  };

  public enterMedicationAdministrationInError = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.services.medication.enterAdministrationInError({
      ...await this.mutation(request),
      entityId: parameter(request, 'administrationId'),
      input: validated(request, 'body'),
    } as never));
  };

  public medicationDueBoard = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.services.medication.dueBoard(
      await this.actor(request),
      validated(request, 'query'),
    ));
  };

  public medicationHistory = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.services.medication.history(
      await this.actor(request),
      validated(request, 'query'),
    ));
  };

  public medicationCompliance = async (request: Request, response: Response) => {
    this.send(request, response, 200, await this.application.services.medication.compliance(
      await this.actor(request),
      validated(request, 'query'),
    ));
  };
}

export interface CreateNursingMedicationRouterOptions {
  application:
    NursingMedicationApplication;
  authenticationService:
    AuthenticationService;
  authorizationService:
    AuthorizationService;
}

export function createNursingMedicationRouter(
  options: CreateNursingMedicationRouterOptions,
): ExpressRouter {
  const router =
    Router();

  const controller =
    new NursingMedicationController(
      options.application,
      options.authorizationService,
    );

  router.use(
    authenticate(
      options.authenticationService,
    ),
  );

  const mutation = (
    permission: Parameters<typeof requirePermission>[1],
    body: z.ZodType,
    handler: RequestHandler,
    path: string,
    params?: z.ZodType,
  ) => {
    router.post(
      path,
      validateRequest({
        headers:
          mutationHeadersSchema,
        ...(params == null
          ? {}
          : {
              params,
            }),
        body,
      }),
      requirePermission(
        options.authorizationService,
        permission,
      ),
      handler,
    );
  };

  const assessmentParams = entityParamsSchema.pick({ assessmentId: true }).required().strict();
  const carePlanParams = entityParamsSchema.pick({ carePlanId: true }).required().strict();
  const taskParams = entityParamsSchema.pick({ taskId: true }).required().strict();
  const vitalParams = entityParamsSchema.pick({ vitalSignId: true }).required().strict();
  const entryParams = entityParamsSchema.pick({ entryId: true }).required().strict();
  const deviceParams = entityParamsSchema.pick({ deviceId: true }).required().strict();
  const handoverParams = entityParamsSchema.pick({ handoverId: true }).required().strict();
  const scheduleParams = entityParamsSchema.pick({ scheduleId: true }).required().strict();
  const administrationParams = entityParamsSchema.pick({ administrationId: true }).required().strict();

  mutation('nursing.notes.create', createNursingAssessmentBodySchema, controller.createAssessment, '/assessments');
  mutation('nursing.notes.create', signNursingAssessmentBodySchema, controller.signAssessment, '/assessments/:assessmentId/sign', assessmentParams);
  mutation('nursing.notes.amend', correctNursingAssessmentBodySchema, controller.correctAssessment, '/assessments/:assessmentId/correct', assessmentParams);
  mutation('nursing.notes.amend', markNursingAssessmentEnteredInErrorBodySchema, controller.enterAssessmentInError, '/assessments/:assessmentId/entered-in-error', assessmentParams);

  mutation('nursing.notes.create', createNursingCarePlanBodySchema, controller.createCarePlan, '/care-plans');
  mutation('nursing.notes.create', reviewNursingCarePlanBodySchema, controller.reviewCarePlan, '/care-plans/:carePlanId/review', carePlanParams);
  mutation('nursing.notes.create', completeNursingCarePlanBodySchema, controller.completeCarePlan, '/care-plans/:carePlanId/complete', carePlanParams);
  mutation('nursing.notes.amend', cancelNursingCarePlanBodySchema, controller.cancelCarePlan, '/care-plans/:carePlanId/cancel', carePlanParams);
  mutation('nursing.notes.amend', correctNursingCarePlanBodySchema, controller.correctCarePlan, '/care-plans/:carePlanId/correct', carePlanParams);

  mutation('nursing.notes.create', createNursingTaskBodySchema, controller.createTask, '/tasks');
  mutation('nursing.notes.create', changeNursingTaskStatusBodySchema, controller.changeTaskStatus, '/tasks/:taskId/status', taskParams);
  mutation('nursing.notes.create', carryForwardNursingTaskBodySchema, controller.carryForwardTask, '/tasks/:taskId/carry-forward', taskParams);

  mutation('nursing.vitals.create', nursingVitalMeasurementBodySchema, controller.recordVital, '/vital-signs');
  mutation('nursing.vitals.amend', correctNursingVitalObservationBodySchema, controller.correctVital, '/vital-signs/:vitalSignId/correct', vitalParams);
  mutation('nursing.vitals.amend', enterNursingVitalObservationInErrorHttpBodySchema, controller.enterVitalInError, '/vital-signs/:vitalSignId/entered-in-error', vitalParams);

  router.get('/vital-signs', validateRequest({ headers: readHeadersSchema, query: nursingVitalTrendQuerySchema }), requirePermission(options.authorizationService, 'nursing.read'), controller.listVitalTrend);

  mutation('nursing.notes.create', recordIntakeOutputBodySchema, controller.recordIntakeOutput, '/intake-output');
  mutation('nursing.notes.amend', correctIntakeOutputBodySchema, controller.correctIntakeOutput, '/intake-output/:entryId/correct', entryParams);
  mutation('nursing.notes.amend', markIntakeOutputEnteredInErrorBodySchema, controller.enterIntakeOutputInError, '/intake-output/:entryId/entered-in-error', entryParams);
  router.get('/intake-output/balance', validateRequest({ headers: readHeadersSchema, query: fluidBalanceQuerySchema }), requirePermission(options.authorizationService, 'nursing.read'), controller.fluidBalance);

  mutation('nursing.notes.create', createNursingDeviceBodySchema, controller.createDevice, '/devices');
  mutation('nursing.notes.create', recordNursingDeviceObservationBodySchema, controller.recordDeviceObservation, '/devices/:deviceId/observations', deviceParams);
  mutation('nursing.notes.amend', removeNursingDeviceBodySchema, controller.removeDevice, '/devices/:deviceId/remove', deviceParams);

  mutation('nursing.handover.manage', correctWardHandoverBodySchema, controller.correctHandover, '/handovers/:handoverId/correct', handoverParams);
  mutation('nursing.handover.manage', enterWardHandoverInErrorBodySchema, controller.enterHandoverInError, '/handovers/:handoverId/entered-in-error', handoverParams);
  router.get('/handovers', validateRequest({ headers: readHeadersSchema, query: wardHandoverListQuerySchema }), requirePermission(options.authorizationService, 'nursing.read'), controller.listHandovers);

  mutation('nursing.medication_administer', createMedicationAdministrationScheduleBodySchema, controller.createMedicationSchedule, '/medication-schedules');
  mutation('nursing.medication_administer', changeMedicationAdministrationScheduleStatusBodySchema, controller.changeMedicationScheduleStatus, '/medication-schedules/:scheduleId/status', scheduleParams);
  mutation('nursing.medication_administer', recordMedicationAdministrationBodySchema, controller.recordMedicationDose, '/medication-schedules/:scheduleId/doses', scheduleParams);
  mutation('nursing.medication_administer', correctMedicationAdministrationBodySchema, controller.correctMedicationAdministration, '/medication-administrations/:administrationId/correct', administrationParams);
  mutation('nursing.medication_administer', enterMedicationAdministrationInErrorBodySchema, controller.enterMedicationAdministrationInError, '/medication-administrations/:administrationId/entered-in-error', administrationParams);

  router.get('/mar/due', validateRequest({ headers: readHeadersSchema, query: medicationDueBoardQuerySchema }), requirePermission(options.authorizationService, 'nursing.read'), controller.medicationDueBoard);
  router.get('/mar/history', validateRequest({ headers: readHeadersSchema, query: medicationAdministrationHistoryQuerySchema }), requirePermission(options.authorizationService, 'nursing.read'), controller.medicationHistory);
  router.get('/mar/compliance', validateRequest({ headers: readHeadersSchema, query: medicationComplianceQuerySchema }), requirePermission(options.authorizationService, 'reports.clinical.read'), controller.medicationCompliance);

  return router;
}

export interface CreateNursingMedicationModuleOptions
extends CreateNursingMedicationRouterOptions {}

export function createNursingMedicationModule(
  options: CreateNursingMedicationModuleOptions,
) {
  return {
    application:
      options.application,
    router:
      createNursingMedicationRouter(
        options,
      ),
  };
}
import type {
  FastifyReply,
} from 'fastify';

import type {
  ZodType,
} from 'zod';

import type {
  RadiologyApplication,
} from './radiology.application.js';

import {
  parseRadiologyInput,
  radiologyActorFromRequest,
  requireRadiologyIdempotencyKey,
  type RadiologyAuthenticatedRequest,
} from './radiology.http.js';

import {
  acknowledgeRadiologyCriticalCommunicationBodySchema,
  addRadiologyReportAddendumBodySchema,
  assignRadiologyReportBodySchema,
  cancelRadiologyAppointmentBodySchema,
  changeRadiologyReportPublicationBodySchema,
  changeRadiologyResourceStatusBodySchema,
  checkInRadiologyExaminationBodySchema,
  completeRadiologyExaminationBodySchema,
  correctRadiologyReportBodySchema,
  createRadiologyResourceBodySchema,
  finalizeRadiologyReportBodySchema,
  radiologyAppointmentIdParamsSchema,
  radiologyAppointmentQuerySchema,
  radiologyCatalogQuerySchema,
  radiologyEncounterIdParamsSchema,
  radiologyEntityIdParamsSchema,
  radiologyHistoryQuerySchema,
  radiologyOrderIdParamsSchema,
  radiologyOrderQuerySchema,
  radiologyPatientIdParamsSchema,
  radiologyReportIdParamsSchema,
  radiologyWorkflowBodySchema,
  recordRadiologyCriticalCommunicationBodySchema,
  recordRadiologySafetyScreeningBodySchema,
  registerRadiologyImagingStudyBodySchema,
  renderRadiologyReportBodySchema,
  saveRadiologyReportDraftBodySchema,
  scheduleRadiologyAppointmentBodySchema,
  startRadiologyExaminationBodySchema,
  submitRadiologyPreliminaryBodySchema,
} from './radiology.http.validation.js';

export class RadiologyController {
  public constructor(
    private readonly application:
      RadiologyApplication,
  ) {}

  public searchModalities =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const result =
        await this.application.services.query.searchModalities(
          radiologyActorFromRequest(
            request,
          ),

          parseRadiologyInput(
            radiologyCatalogQuerySchema,
            request.query,
          ),
        );

      await reply
        .status(
          200,
        )
        .send(
          result,
        );
    };

  public searchProcedures =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const result =
        await this.application.services.query.searchProcedures(
          radiologyActorFromRequest(
            request,
          ),

          parseRadiologyInput(
            radiologyCatalogQuerySchema,
            request.query,
          ),
        );

      await reply
        .status(
          200,
        )
        .send(
          result,
        );
    };

  public getProcedure =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          id:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        id,
      } =
        parseRadiologyInput(
          radiologyEntityIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.query.getProcedure(
            radiologyActorFromRequest(
              request,
            ),
            id,
          ),
        );
    };

  public createModality =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          201,
        )
        .send(
          await this.application.workflows.createModality.execute(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  radiologyWorkflowBodySchema,
                  request.body,
                ) as never,

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public updateModality =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          id:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        id,
      } =
        parseRadiologyInput(
          radiologyEntityIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.workflows.updateModality.execute(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              entityId:
                id,

              input:
                parseRadiologyInput(
                  radiologyWorkflowBodySchema,
                  request.body,
                ) as never,

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public changeModalityStatus =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          id:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        id,
      } =
        parseRadiologyInput(
          radiologyEntityIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.workflows.changeModalityStatus.execute(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              entityId:
                id,

              input:
                parseRadiologyInput(
                  radiologyWorkflowBodySchema,
                  request.body,
                ) as never,

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public createProcedure =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          201,
        )
        .send(
          await this.application.workflows.createProcedure.execute(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  radiologyWorkflowBodySchema,
                  request.body,
                ) as never,

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public updateProcedure =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          id:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        id,
      } =
        parseRadiologyInput(
          radiologyEntityIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.workflows.updateProcedure.execute(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              entityId:
                id,

              input:
                parseRadiologyInput(
                  radiologyWorkflowBodySchema,
                  request.body,
                ) as never,

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public changeProcedureStatus =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          id:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        id,
      } =
        parseRadiologyInput(
          radiologyEntityIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.workflows.changeProcedureStatus.execute(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              entityId:
                id,

              input:
                parseRadiologyInput(
                  radiologyWorkflowBodySchema,
                  request.body,
                ) as never,

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public listOrders =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.query.listOrders(
            radiologyActorFromRequest(
              request,
            ),

            parseRadiologyInput(
              radiologyOrderQuerySchema,
              request.query,
            ),
          ),
        );
    };

  public getOrder =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          orderId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        orderId,
      } =
        parseRadiologyInput(
          radiologyOrderIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.query.getOrder(
            radiologyActorFromRequest(
              request,
            ),
            orderId,
          ),
        );
    };

  public createOrder =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          201,
        )
        .send(
          await this.application.workflows.createOrder.execute(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  radiologyWorkflowBodySchema,
                  request.body,
                ) as never,

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public acceptOrder =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          orderId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runOrderMutation(
        request,
        reply,
        this.application.workflows.acceptOrder.execute.bind(
          this.application.workflows.acceptOrder,
        ),
      );
    };

  public rejectOrder =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          orderId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runOrderMutation(
        request,
        reply,
        this.application.workflows.rejectOrder.execute.bind(
          this.application.workflows.rejectOrder,
        ),
      );
    };

  public cancelOrder =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          orderId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runOrderMutation(
        request,
        reply,
        this.application.workflows.cancelOrder.execute.bind(
          this.application.workflows.cancelOrder,
        ),
      );
    };

  public listResources =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.query.listResources(
            radiologyActorFromRequest(
              request,
            ),

            parseRadiologyInput(
              radiologyCatalogQuerySchema,
              request.query,
            ),
          ),
        );
    };

  public createResource =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          201,
        )
        .send(
          await this.application.services.imagingOperations.createResource(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  createRadiologyResourceBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public changeResourceStatus =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          id:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        id,
      } =
        parseRadiologyInput(
          radiologyEntityIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.imagingOperations.changeResourceStatus(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              resourceId:
                id,

              input:
                parseRadiologyInput(
                  changeRadiologyResourceStatusBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public listAppointments =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.query.listAppointments(
            radiologyActorFromRequest(
              request,
            ),

            parseRadiologyInput(
              radiologyAppointmentQuerySchema,
              request.query,
            ),
          ),
        );
    };

  public scheduleAppointment =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          201,
        )
        .send(
          await this.application.services.imagingOperations.scheduleAppointment(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  scheduleRadiologyAppointmentBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public cancelAppointment =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          appointmentId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        appointmentId,
      } =
        parseRadiologyInput(
          radiologyAppointmentIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.imagingOperations.cancelAppointment(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              appointmentId,

              input:
                parseRadiologyInput(
                  cancelRadiologyAppointmentBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public recordSafetyScreening =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.imagingOperations.recordSafetyScreening(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  recordRadiologySafetyScreeningBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public checkIn =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.imagingOperations.checkIn(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  checkInRadiologyExaminationBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public startExamination =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.imagingOperations.startExamination(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  startRadiologyExaminationBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public completeExamination =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.imagingOperations.completeExamination(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  completeRadiologyExaminationBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public registerStudy =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          201,
        )
        .send(
          await this.application.services.imagingOperations.registerImagingStudy(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  registerRadiologyImagingStudyBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public assignReport =
    async (
      request:
        RadiologyAuthenticatedRequest,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await reply
        .status(
          201,
        )
        .send(
          await this.application.services.reporting.assignReport(
            {
              actor:
                radiologyActorFromRequest(
                  request,
                ),

              input:
                parseRadiologyInput(
                  assignRadiologyReportBodySchema,
                  request.body,
                ),

              idempotencyKey:
                requireRadiologyIdempotencyKey(
                  request,
                ),
            },
          ),
        );
    };

  public getReport =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        reportId,
      } =
        parseRadiologyInput(
          radiologyReportIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.query.getReport(
            radiologyActorFromRequest(
              request,
            ),
            reportId,
          ),
        );
    };

  public saveReportDraft =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runReportMutation(
        request,
        reply,
        saveRadiologyReportDraftBodySchema,
        this.application.services.reporting.saveDraft.bind(
          this.application.services.reporting,
        ),
      );
    };

  public submitPreliminary =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runReportMutation(
        request,
        reply,
        submitRadiologyPreliminaryBodySchema,
        this.application.services.reporting.submitPreliminary.bind(
          this.application.services.reporting,
        ),
      );
    };

  public finalizeReport =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runReportMutation(
        request,
        reply,
        finalizeRadiologyReportBodySchema,
        this.application.services.reporting.finalize.bind(
          this.application.services.reporting,
        ),
      );
    };

  public correctReport =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runReportMutation(
        request,
        reply,
        correctRadiologyReportBodySchema,
        this.application.services.reporting.correct.bind(
          this.application.services.reporting,
        ),
      );
    };

  public addAddendum =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runReportMutation(
        request,
        reply,
        addRadiologyReportAddendumBodySchema,
        this.application.services.reporting.addAddendum.bind(
          this.application.services.reporting,
        ),
      );
    };

  public publishReport =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runPublicationMutation(
        request,
        reply,
        'PUBLISHED',
      );
    };

  public withdrawReport =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runPublicationMutation(
        request,
        reply,
        'WITHDRAWN',
      );
    };

  public recordCriticalCommunication =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runReportMutation(
        request,
        reply,
        recordRadiologyCriticalCommunicationBodySchema,
        this.application.services.reporting.recordCriticalCommunication.bind(
          this.application.services.reporting,
        ),
      );
    };

  public acknowledgeCriticalCommunication =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runReportMutation(
        request,
        reply,
        acknowledgeRadiologyCriticalCommunicationBodySchema,
        this.application.services.reporting.acknowledgeCriticalCommunication.bind(
          this.application.services.reporting,
        ),
      );
    };

  public renderReport =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      await this.runReportMutation(
        request,
        reply,
        renderRadiologyReportBodySchema,
        this.application.services.reporting.renderFinalReport.bind(
          this.application.services.reporting,
        ),
      );
    };

  public getPublishedReport =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          reportId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        reportId,
      } =
        parseRadiologyInput(
          radiologyReportIdParamsSchema,
          request.params,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.reporting.getPublishedSnapshot(
            radiologyActorFromRequest(
              request,
            ),
            reportId,
          ),
        );
    };

  public listEncounterHistory =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          encounterId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        encounterId,
      } =
        parseRadiologyInput(
          radiologyEncounterIdParamsSchema,
          request.params,
        );

      const query =
        parseRadiologyInput(
          radiologyHistoryQuerySchema,
          request.query,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.reporting.listEncounterHistory(
            radiologyActorFromRequest(
              request,
            ),
            encounterId,
            query.page,
            query.pageSize,
          ),
        );
    };

  public listPatientHistory =
    async (
      request:
        RadiologyAuthenticatedRequest<{
          patientId:
            string;
        }>,

      reply:
        FastifyReply,
    ): Promise<void> => {
      const {
        patientId,
      } =
        parseRadiologyInput(
          radiologyPatientIdParamsSchema,
          request.params,
        );

      const query =
        parseRadiologyInput(
          radiologyHistoryQuerySchema,
          request.query,
        );

      await reply
        .status(
          200,
        )
        .send(
          await this.application.services.reporting.listPatientHistory(
            radiologyActorFromRequest(
              request,
            ),
            patientId,
            query.page,
            query.pageSize,
          ),
        );
    };

  private async runOrderMutation(
    request:
      RadiologyAuthenticatedRequest<{
        orderId:
          string;
      }>,

    reply:
      FastifyReply,

    execute:
      (
        command:
          never,
      ) => Promise<unknown>,
  ): Promise<void> {
    const {
      orderId,
    } =
      parseRadiologyInput(
        radiologyOrderIdParamsSchema,
        request.params,
      );

    await reply
      .status(
        200,
      )
      .send(
        await execute({
          actor:
            radiologyActorFromRequest(
              request,
            ),

          orderId,

          input:
            parseRadiologyInput(
              radiologyWorkflowBodySchema,
              request.body,
            ),

          idempotencyKey:
            requireRadiologyIdempotencyKey(
              request,
            ),
        } as never),
      );
  }

  private async runReportMutation<T>(
    request:
      RadiologyAuthenticatedRequest<{
        reportId:
          string;
      }>,

    reply:
      FastifyReply,

    schema:
      ZodType<T>,

    execute:
      (
        command:
          never,
      ) => Promise<unknown>,
  ): Promise<void> {
    const {
      reportId,
    } =
      parseRadiologyInput(
        radiologyReportIdParamsSchema,
        request.params,
      );

    await reply
      .status(
        200,
      )
      .send(
        await execute({
          actor:
            radiologyActorFromRequest(
              request,
            ),

          reportId,

          input:
            parseRadiologyInput(
              schema,
              request.body,
            ),

          idempotencyKey:
            requireRadiologyIdempotencyKey(
              request,
            ),
        } as never),
      );
  }

  private async runPublicationMutation(
    request:
      RadiologyAuthenticatedRequest<{
        reportId:
          string;
      }>,

    reply:
      FastifyReply,

    publicationStatus:
      | 'PUBLISHED'
      | 'WITHDRAWN',
  ): Promise<void> {
    const {
      reportId,
    } =
      parseRadiologyInput(
        radiologyReportIdParamsSchema,
        request.params,
      );

    const body =
      request.body !==
        null &&
      typeof request.body ===
        'object' &&
      !Array.isArray(
        request.body,
      )
        ? request.body as Record<
            string,
            unknown
          >
        : {};

    const input =
      parseRadiologyInput(
        changeRadiologyReportPublicationBodySchema,
        {
          ...body,
          publicationStatus,
        },
      );

    await reply
      .status(
        200,
      )
      .send(
        await this.application.services.reporting.changePublication(
          {
            actor:
              radiologyActorFromRequest(
                request,
              ),

            reportId,

            input,

            idempotencyKey:
              requireRadiologyIdempotencyKey(
                request,
              ),
          },
        ),
      );
  }
}
import type {
  FastifyReply,
} from 'fastify';

import type {
  LaboratoryApplication,
} from './laboratory.application.js';

import {
  laboratoryActorFromRequest,
  parseLaboratoryInput,
  requireIdempotencyKey,
  type LaboratoryAuthenticatedRequest,
} from './laboratory.http.js';

import {
  acceptLaboratoryOrderHttpSchema,
  accessionLaboratorySpecimenHttpSchema,
  cancelLaboratoryOrderHttpSchema,
  changeLaboratoryCatalogStatusHttpSchema,
  changeLaboratoryResultPublicationHttpSchema,
  collectLaboratorySpecimenHttpSchema,
  correctLaboratoryResultHttpSchema,
  createLaboratoryCategoryHttpSchema,
  createLaboratoryOrderHttpSchema,
  createLaboratoryTestHttpSchema,
  criticalResultCommunicationHttpSchema,
  enterLaboratoryResultHttpSchema,
  laboratoryCatalogQuerySchema,
  laboratoryEncounterIdParamsSchema,
  laboratoryEntityIdParamsSchema,
  laboratoryHistoryQuerySchema,
  laboratoryOrderIdParamsSchema,
  laboratoryOrderQuerySchema,
  laboratoryPatientIdParamsSchema,
  laboratoryResultIdParamsSchema,
  laboratorySpecimenIdParamsSchema,
  printLaboratorySpecimenLabelHttpSchema,
  receiveLaboratorySpecimenHttpSchema,
  rejectLaboratorySpecimenHttpSchema,
  updateLaboratoryCategoryHttpSchema,
  updateLaboratoryTestHttpSchema,
  validateLaboratoryResultHttpSchema,
  verifyLaboratoryResultHttpSchema,
} from './laboratory.http.validation.js';

export class LaboratoryController {
  public constructor(
    private readonly application: LaboratoryApplication,
  ) {}

  public searchCatalog = async (
    request: LaboratoryAuthenticatedRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const query = parseLaboratoryInput(
      laboratoryCatalogQuerySchema,
      request.query,
    );

    const result =
      await this.application.services.query.searchCatalog(
        laboratoryActorFromRequest(request),
        query,
      );

    await reply.status(200).send(result);
  };

  public getTest = async (
    request: LaboratoryAuthenticatedRequest<{
      id: string;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryEntityIdParamsSchema,
      request.params,
    );

    const result =
      await this.application.services.query.getTest(
        laboratoryActorFromRequest(request),
        params.id,
      );

    await reply.status(200).send(result);
  };

  public createCategory = async (
    request: LaboratoryAuthenticatedRequest<
      Record<string, string>,
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const input = parseLaboratoryInput(
      createLaboratoryCategoryHttpSchema,
      request.body,
    );

    const result =
      await this.application.workflows.createCategory.execute({
        actor: laboratoryActorFromRequest(request),
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(201).send(result);
  };

  public updateCategory = async (
    request: LaboratoryAuthenticatedRequest<
      {
        id: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryEntityIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      updateLaboratoryCategoryHttpSchema,
      request.body,
    );

    const result =
      await this.application.workflows.updateCategory.execute({
        actor: laboratoryActorFromRequest(request),
        entityId: params.id,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public changeCategoryStatus = async (
    request: LaboratoryAuthenticatedRequest<
      {
        id: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryEntityIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      changeLaboratoryCatalogStatusHttpSchema,
      request.body,
    );

    const result =
      await this.application.workflows.changeCategoryStatus.execute({
        actor: laboratoryActorFromRequest(request),
        entityId: params.id,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public createTest = async (
    request: LaboratoryAuthenticatedRequest<
      Record<string, string>,
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const input = parseLaboratoryInput(
      createLaboratoryTestHttpSchema,
      request.body,
    );

    const result =
      await this.application.workflows.createTest.execute({
        actor: laboratoryActorFromRequest(request),
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(201).send(result);
  };

  public updateTest = async (
    request: LaboratoryAuthenticatedRequest<
      {
        id: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryEntityIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      updateLaboratoryTestHttpSchema,
      request.body,
    );

    const result =
      await this.application.workflows.updateTest.execute({
        actor: laboratoryActorFromRequest(request),
        entityId: params.id,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public changeTestStatus = async (
    request: LaboratoryAuthenticatedRequest<
      {
        id: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryEntityIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      changeLaboratoryCatalogStatusHttpSchema,
      request.body,
    );

    const result =
      await this.application.workflows.changeTestStatus.execute({
        actor: laboratoryActorFromRequest(request),
        entityId: params.id,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public createOrder = async (
    request: LaboratoryAuthenticatedRequest<
      Record<string, string>,
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const input = parseLaboratoryInput(
      createLaboratoryOrderHttpSchema,
      request.body,
    );

    const result =
      await this.application.workflows.createOrder.execute({
        actor: laboratoryActorFromRequest(request),
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(201).send(result);
  };

  public listOrders = async (
    request: LaboratoryAuthenticatedRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const query = parseLaboratoryInput(
      laboratoryOrderQuerySchema,
      request.query,
    );

    const result =
      await this.application.services.query.listOperationalOrders(
        laboratoryActorFromRequest(request),
        query,
      );

    await reply.status(200).send(result);
  };

  public getOrder = async (
    request: LaboratoryAuthenticatedRequest<{
      orderId: string;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryOrderIdParamsSchema,
      request.params,
    );

    const result =
      await this.application.services.query.getOperationalOrder(
        laboratoryActorFromRequest(request),
        params.orderId,
      );

    await reply.status(200).send(result);
  };

  public acceptOrder = async (
    request: LaboratoryAuthenticatedRequest<
      {
        orderId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryOrderIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      acceptLaboratoryOrderHttpSchema,
      request.body,
    );

    const result =
      await this.application.workflows.acceptOrder.execute({
        actor: laboratoryActorFromRequest(request),
        orderId: params.orderId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public cancelOrder = async (
    request: LaboratoryAuthenticatedRequest<
      {
        orderId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryOrderIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      cancelLaboratoryOrderHttpSchema,
      request.body,
    );

    const result =
      await this.application.workflows.cancelOrder.execute({
        actor: laboratoryActorFromRequest(request),
        orderId: params.orderId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public accessionSpecimen = async (
    request: LaboratoryAuthenticatedRequest<
      Record<string, string>,
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const input = parseLaboratoryInput(
      accessionLaboratorySpecimenHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.specimens.accession({
        actor: laboratoryActorFromRequest(request),
        orderItemId: input.orderItemId,
        requirementCode: input.requirementCode,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(201).send(result);
  };

  public printSpecimenLabel = async (
    request: LaboratoryAuthenticatedRequest<
      {
        specimenId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratorySpecimenIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      printLaboratorySpecimenLabelHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.specimens.printLabel({
        actor: laboratoryActorFromRequest(request),
        specimenId: params.specimenId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public collectSpecimen = async (
    request: LaboratoryAuthenticatedRequest<
      {
        specimenId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratorySpecimenIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      collectLaboratorySpecimenHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.specimens.collect({
        actor: laboratoryActorFromRequest(request),
        specimenId: params.specimenId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public receiveSpecimen = async (
    request: LaboratoryAuthenticatedRequest<
      {
        specimenId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratorySpecimenIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      receiveLaboratorySpecimenHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.specimens.receive({
        actor: laboratoryActorFromRequest(request),
        specimenId: params.specimenId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public rejectSpecimen = async (
    request: LaboratoryAuthenticatedRequest<
      {
        specimenId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratorySpecimenIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      rejectLaboratorySpecimenHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.specimens.reject({
        actor: laboratoryActorFromRequest(request),
        specimenId: params.specimenId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public enterResult = async (
    request: LaboratoryAuthenticatedRequest<
      Record<string, string>,
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const input = parseLaboratoryInput(
      enterLaboratoryResultHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.resultCommands.enter({
        actor: laboratoryActorFromRequest(request),
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(
      input.expectedVersion === undefined
        ? 201
        : 200,
    ).send(result);
  };

  public validateResult = async (
    request: LaboratoryAuthenticatedRequest<
      {
        resultId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryResultIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      validateLaboratoryResultHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.resultCommands.validate({
        actor: laboratoryActorFromRequest(request),
        resultId: params.resultId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public verifyResult = async (
    request: LaboratoryAuthenticatedRequest<
      {
        resultId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryResultIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      verifyLaboratoryResultHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.resultCommands.verify({
        actor: laboratoryActorFromRequest(request),
        resultId: params.resultId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public correctResult = async (
    request: LaboratoryAuthenticatedRequest<
      {
        resultId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryResultIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      correctLaboratoryResultHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.resultCommands.correct({
        actor: laboratoryActorFromRequest(request),
        resultId: params.resultId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public changeResultPublication = async (
    request: LaboratoryAuthenticatedRequest<
      {
        resultId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryResultIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      changeLaboratoryResultPublicationHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.resultCommands.changePublication({
        actor: laboratoryActorFromRequest(request),
        resultId: params.resultId,
        input,
        idempotencyKey: requireIdempotencyKey(request),
      });

    await reply.status(200).send(result);
  };

  public recordCriticalCommunication = async (
    request: LaboratoryAuthenticatedRequest<
      {
        resultId: string;
      },
      Record<string, unknown>,
      unknown
    >,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryResultIdParamsSchema,
      request.params,
    );

    const input = parseLaboratoryInput(
      criticalResultCommunicationHttpSchema,
      request.body,
    );

    const result =
      await this.application.services.resultCommands
        .recordCriticalCommunication({
          actor: laboratoryActorFromRequest(request),
          resultId: params.resultId,
          input,
          idempotencyKey: requireIdempotencyKey(request),
        });

    await reply.status(201).send(result);
  };

  public getResult = async (
    request: LaboratoryAuthenticatedRequest<{
      resultId: string;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryResultIdParamsSchema,
      request.params,
    );

    const result =
      await this.application.services.resultQueries.getResult(
        laboratoryActorFromRequest(request),
        params.resultId,
      );

    await reply.status(200).send(result);
  };

  public listPatientResultHistory = async (
    request: LaboratoryAuthenticatedRequest<{
      patientId: string;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryPatientIdParamsSchema,
      request.params,
    );

    const query = parseLaboratoryInput(
      laboratoryHistoryQuerySchema,
      request.query,
    );

    const result =
      await this.application.services.resultQueries.listPatientHistory(
        laboratoryActorFromRequest(request),
        params.patientId,
        query.page,
        query.pageSize,
      );

    await reply.status(200).send(result);
  };

  public listEncounterResultHistory = async (
    request: LaboratoryAuthenticatedRequest<{
      encounterId: string;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryEncounterIdParamsSchema,
      request.params,
    );

    const query = parseLaboratoryInput(
      laboratoryHistoryQuerySchema,
      request.query,
    );

    const result =
      await this.application.services.resultQueries.listEncounterHistory(
        laboratoryActorFromRequest(request),
        params.encounterId,
        query.page,
        query.pageSize,
      );

    await reply.status(200).send(result);
  };

  public printOrderReport = async (
    request: LaboratoryAuthenticatedRequest<{
      orderId: string;
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const params = parseLaboratoryInput(
      laboratoryOrderIdParamsSchema,
      request.params,
    );

    const document =
      await this.application.services.resultQueries.printOrderReport(
        laboratoryActorFromRequest(request),
        params.orderId,
      );

    await reply
      .header(
        'Content-Type',
        document.mediaType,
      )
      .header(
        'Content-Disposition',
        `attachment; filename="${document.filename}"`,
      )
      .header(
        'ETag',
        `"${document.contentHash}"`,
      )
      .status(200)
      .send(Buffer.from(document.bytes));
  };
}
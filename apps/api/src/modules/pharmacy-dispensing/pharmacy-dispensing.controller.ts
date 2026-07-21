import type {
  Request,
  Response,
} from 'express';

import {
  ResourceNotFoundError,
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  PharmacyDispensingApplication,
} from './pharmacy-dispensing.application.js';

import type {
  PharmacyActorResolverPort,
} from './pharmacy-dispensing.ports.js';

import {
  pharmacyActorFromRequest,
  pharmacyIdempotencyKeyFromRequest,
  validatedPharmacyPart,
} from './pharmacy-dispensing.http-contracts.js';

import type {
  PharmacyControlledRegisterListQuery,
  PharmacyDispensationListQuery,
  PharmacyDispensingActorContext,
} from './pharmacy-dispensing.contracts.js';

function jsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 24) {
    return null;
  }

  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => jsonSafe(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;

    if (typeof candidate['toHexString'] === 'function') {
      return (candidate['toHexString'] as () => string)();
    }

    if (candidate['_bsontype'] === 'Decimal128' && typeof candidate['toString'] === 'function') {
      return (candidate['toString'] as () => string)();
    }

    if (typeof candidate['toObject'] === 'function') {
      return jsonSafe((candidate['toObject'] as () => unknown)(), depth + 1);
    }

    return Object.fromEntries(
      Object.entries(candidate).map(([key, nested]) => [
        key,
        jsonSafe(nested, depth + 1),
      ]),
    );
  }

  return String(value);
}

export class PharmacyDispensingController {
  public constructor(
    private readonly application: PharmacyDispensingApplication,
    private readonly authorization: AuthorizationService,
    private readonly actorResolver: PharmacyActorResolverPort,
  ) {}

  private actor(request: Request): Promise<PharmacyDispensingActorContext> {
    return pharmacyActorFromRequest(
      request,
      this.authorization,
      this.actorResolver,
    );
  }

  private async mutationContext(request: Request): Promise<{
    actor: PharmacyDispensingActorContext;
    idempotencyKey: string;
  }> {
    return {
      actor: await this.actor(request),
      idempotencyKey: pharmacyIdempotencyKeyFromRequest(request),
    };
  }

  private parameter(request: Request, key: string): string {
    const value = validatedPharmacyPart<Record<string, string | undefined>>(
      request,
      'params',
    )[key];

    if (value === undefined) {
      throw new ResourceNotFoundError(
        `Pharmacy dispensing route parameter ${key} is unavailable`,
      );
    }

    return value;
  }

  private send(
    request: Request,
    response: Response,
    status: number,
    result: unknown,
  ): void {
    response.status(status).json(
      createApiSuccess(
        jsonSafe(result),
        request.correlationId,
      ),
    );
  }

  public listWorklist = async (request: Request, response: Response): Promise<void> => {
    const result = await this.application.services.queries.listWorklist(
      await this.actor(request),
      validatedPharmacyPart<PharmacyDispensationListQuery>(request, 'query'),
    );
    this.send(request, response, 200, result);
  };

  public listDispensations = async (request: Request, response: Response): Promise<void> => {
    const result = await this.application.services.queries.listDispensations(
      await this.actor(request),
      validatedPharmacyPart<PharmacyDispensationListQuery>(request, 'query'),
    );
    this.send(request, response, 200, result);
  };

  public getDispensation = async (request: Request, response: Response): Promise<void> => {
    const actor = await this.actor(request);
    const result = await this.application.services.queries.getDispensation(
      actor,
      this.parameter(request, 'dispensationId'),
    );
    this.send(request, response, 200, result);
  };

  public createIntake = async (request: Request, response: Response): Promise<void> => {
    const context = await this.mutationContext(request);
    const created = await this.application.workflows.createDispensationIntake.execute({
      ...context,
      input: validatedPharmacyPart(request, 'body'),
    } as never);
    const result = await this.application.services.queries.getDispensation(
      context.actor,
      created._id.toHexString(),
    );
    this.send(request, response, 201, result);
  };

  public verify = async (request: Request, response: Response): Promise<void> => {
    await this.executeDispensationWorkflow(
      request,
      response,
      'verifyDispensation',
    );
  };

  public hold = async (request: Request, response: Response): Promise<void> => {
    await this.executeDispensationWorkflow(request, response, 'holdDispensation');
  };

  public release = async (request: Request, response: Response): Promise<void> => {
    await this.executeDispensationWorkflow(request, response, 'releaseDispensation');
  };

  public reject = async (request: Request, response: Response): Promise<void> => {
    await this.executeDispensationWorkflow(request, response, 'rejectDispensation');
  };

  public reserve = async (request: Request, response: Response): Promise<void> => {
    await this.executeDispensationWorkflow(request, response, 'reserveDispensationStock');
  };

  public dispense = async (request: Request, response: Response): Promise<void> => {
    await this.executeDispensationWorkflow(request, response, 'completeDispensation');
  };

  private async executeDispensationWorkflow(
    request: Request,
    response: Response,
    workflowName:
      | 'verifyDispensation'
      | 'holdDispensation'
      | 'releaseDispensation'
      | 'rejectDispensation'
      | 'reserveDispensationStock'
      | 'completeDispensation',
  ): Promise<void> {
    const context = await this.mutationContext(request);
    const dispensationId = this.parameter(request, 'dispensationId');
    const workflow = this.application.workflows[workflowName];

    await workflow.execute({
      ...context,
      dispensationId,
      input: validatedPharmacyPart(request, 'body'),
    } as never);

    const result = await this.application.services.queries.getDispensation(
      context.actor,
      dispensationId,
    );
    this.send(request, response, 200, result);
  }

  public proposeSubstitution = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutationContext(request);
    const result = await this.application.workflows.proposeSubstitution.execute({
      ...context,
      dispensationId: this.parameter(request, 'dispensationId'),
      dispensationItemId: this.parameter(request, 'dispensationItemId'),
      input: validatedPharmacyPart(request, 'body'),
    } as never);
    this.send(request, response, 201, result);
  };

  public decideSubstitution = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutationContext(request);
    const result = await this.application.workflows.decideSubstitution.execute({
      ...context,
      dispensationId: this.parameter(request, 'dispensationId'),
      substitutionId: this.parameter(request, 'substitutionId'),
      input: validatedPharmacyPart(request, 'body'),
    } as never);
    this.send(request, response, 200, result);
  };

  public generateLabel = async (request: Request, response: Response): Promise<void> => {
    const context = await this.mutationContext(request);
    const body = validatedPharmacyPart<{ languageCode: string }>(request, 'body');
    const result = await this.application.workflows.generateDispensingLabel.execute({
      ...context,
      dispensationId: this.parameter(request, 'dispensationId'),
      dispensationItemId: this.parameter(request, 'dispensationItemId'),
      languageCode: body.languageCode,
    });
    this.send(request, response, 201, result);
  };

  public printLabel = async (request: Request, response: Response): Promise<void> => {
    const context = await this.mutationContext(request);
    const result = await this.application.workflows.printDispensingLabel.execute({
      ...context,
      labelId: this.parameter(request, 'labelId'),
      input: validatedPharmacyPart(request, 'body'),
    } as never);
    this.send(request, response, 200, result);
  };

  public recordCounselling = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutationContext(request);
    const result = await this.application.workflows.recordCounselling.execute({
      ...context,
      dispensationId: this.parameter(request, 'dispensationId'),
      input: validatedPharmacyPart(request, 'body'),
    } as never);
    this.send(request, response, 201, result);
  };

  public createPatientReturn = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutationContext(request);
    const result = await this.application.workflows.createPatientReturn.execute({
      ...context,
      input: validatedPharmacyPart(request, 'body'),
    } as never);
    this.send(request, response, 201, result);
  };

  public getPatientReturn = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.application.services.queries.getPatientReturn(
      await this.actor(request),
      this.parameter(request, 'returnId'),
    );
    this.send(request, response, 200, result);
  };

  public postPatientReturn = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutationContext(request);
    const body = validatedPharmacyPart<{ expectedVersion: number }>(request, 'body');
    const returnId = this.parameter(request, 'returnId');
    await this.application.workflows.postPatientReturn.execute({
      ...context,
      returnId,
      expectedVersion: body.expectedVersion,
    });
    const result = await this.application.services.queries.getPatientReturn(
      context.actor,
      returnId,
    );
    this.send(request, response, 200, result);
  };

  public requestReversal = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutationContext(request);
    const result = await this.application.workflows.requestReversal.execute({
      ...context,
      dispensationId: this.parameter(request, 'dispensationId'),
      input: validatedPharmacyPart(request, 'body'),
    } as never);
    this.send(request, response, 201, result);
  };

  public postReversal = async (request: Request, response: Response): Promise<void> => {
    const context = await this.mutationContext(request);
    const body = validatedPharmacyPart<{
      expectedVersion: number;
      dispensationItemIds?: readonly string[];
    }>(request, 'body');
    const result = await this.application.workflows.postReversal.execute({
      ...context,
      reversalId: this.parameter(request, 'reversalId'),
      expectedVersion: body.expectedVersion,
      ...(body.dispensationItemIds === undefined
        ? {}
        : { dispensationItemIds: body.dispensationItemIds }),
    });
    this.send(request, response, 200, result);
  };

  public listControlledRegister = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.application.services.queries.listControlledRegister(
      await this.actor(request),
      validatedPharmacyPart<PharmacyControlledRegisterListQuery>(request, 'query'),
    );
    this.send(request, response, 200, result);
  };

  public reportSummary = async (request: Request, response: Response): Promise<void> => {
    const result = await this.application.services.queries.summary(
      await this.actor(request),
      validatedPharmacyPart(request, 'query'),
    );
    this.send(request, response, 200, result);
  };

  public recoveryDashboard = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.application.services.queries.recoveryDashboard(
      await this.actor(request),
    );
    this.send(request, response, 200, result);
  };

  public prepareRecovery = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const context = await this.mutationContext(request);
    const params = validatedPharmacyPart<{
      entityType: 'DISPENSATION' | 'PATIENT_RETURN' | 'DISPENSATION_REVERSAL';
      entityId: string;
    }>(request, 'params');
    const body = validatedPharmacyPart<{
      expectedVersion: number;
      recoveryReason: string;
    }>(request, 'body');
    const result = await this.application.workflows.recoverFinalization.execute({
      ...context,
      ...params,
      ...body,
    });
    this.send(request, response, 200, result);
  };
}
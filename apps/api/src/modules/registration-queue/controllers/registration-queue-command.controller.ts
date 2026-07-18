import type {
  Request,
  Response,
} from 'express';

import {
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  RegistrationQueueApplication,
} from '../registration-queue.application.js';

import {
  registrationQueueMutationContextFromRequest,
  validatedRegistrationQueuePart,
} from '../registration-queue.http-helpers.js';

import type {
  CancelOpdVisitBody,
  CancelRegistrationBody,
  ChangeQueueStatusBody,
  CorrectOpdVisitBody,
  MarkOpdVisitNoShowBody,
  RegisterOpdVisitBody,
  TransferQueueEntryBody,
  UpdateQueueAssignmentBody,
  UpdateQueuePriorityBody,
} from '../registration-queue.validation.js';

export interface RegistrationIdParams {
  registrationId: string;
}

export interface OpdVisitIdParams {
  visitId: string;
}

export interface QueueEntryIdParams {
  queueEntryId: string;
}

export class RegistrationQueueCommandController {
  public constructor(
    private readonly application:
      RegistrationQueueApplication,
  ) {}

  public registerOpdVisit = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result =
      await this.application
        .workflows
        .registerOpdVisit
        .execute({
          input:
            validatedRegistrationQueuePart<
              RegisterOpdVisitBody
            >(
              request,
              'body',
            ),

          ...registrationQueueMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public cancelRegistration = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const params =
      validatedRegistrationQueuePart<
        RegistrationIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .cancelRegistration
        .execute({
          registrationId:
            params.registrationId,

          input:
            validatedRegistrationQueuePart<
              CancelRegistrationBody
            >(
              request,
              'body',
            ),

          ...registrationQueueMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public cancelOpdVisit = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const params =
      validatedRegistrationQueuePart<
        OpdVisitIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .cancelOpdVisit
        .execute({
          visitId:
            params.visitId,

          input:
            validatedRegistrationQueuePart<
              CancelOpdVisitBody
            >(
              request,
              'body',
            ),

          ...registrationQueueMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public markOpdVisitNoShow = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const params =
      validatedRegistrationQueuePart<
        OpdVisitIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .markOpdVisitNoShow
        .execute({
          visitId:
            params.visitId,

          input:
            validatedRegistrationQueuePart<
              MarkOpdVisitNoShowBody
            >(
              request,
              'body',
            ),

          ...registrationQueueMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public correctOpdVisit = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const params =
      validatedRegistrationQueuePart<
        OpdVisitIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .correctOpdVisit
        .execute({
          visitId:
            params.visitId,

          input:
            validatedRegistrationQueuePart<
              CorrectOpdVisitBody
            >(
              request,
              'body',
            ),

          ...registrationQueueMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public changeQueueStatus = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const params =
      validatedRegistrationQueuePart<
        QueueEntryIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .changeQueueStatus
        .execute({
          queueEntryId:
            params.queueEntryId,

          input:
            validatedRegistrationQueuePart<
              ChangeQueueStatusBody
            >(
              request,
              'body',
            ),

          ...registrationQueueMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public updateQueueAssignment = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const params =
      validatedRegistrationQueuePart<
        QueueEntryIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .updateQueueAssignment
        .execute({
          queueEntryId:
            params.queueEntryId,

          input:
            validatedRegistrationQueuePart<
              UpdateQueueAssignmentBody
            >(
              request,
              'body',
            ),

          ...registrationQueueMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public updateQueuePriority = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const params =
      validatedRegistrationQueuePart<
        QueueEntryIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .updateQueuePriority
        .execute({
          queueEntryId:
            params.queueEntryId,

          input:
            validatedRegistrationQueuePart<
              UpdateQueuePriorityBody
            >(
              request,
              'body',
            ),

          ...registrationQueueMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public transferQueueEntry = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const params =
      validatedRegistrationQueuePart<
        QueueEntryIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.application
        .workflows
        .transferQueueEntry
        .execute({
          queueEntryId:
            params.queueEntryId,

          input:
            validatedRegistrationQueuePart<
              TransferQueueEntryBody
            >(
              request,
              'body',
            ),

          ...registrationQueueMutationContextFromRequest(
            request,
          ),
        });

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };
}
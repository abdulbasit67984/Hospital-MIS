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
  registrationQueueActorFromRequest,
  validatedRegistrationQueuePart,
} from '../registration-queue.http-helpers.js';

import type {
  OpdVisitNumberParams,
  RegistrationNumberParams,
  RegistrationQueueConfigurationHttpQuery,
  RegistrationQueueDashboardHttpQuery,
  RegistrationQueueHistoryHttpQuery,
  RegistrationQueuePublicDisplayHttpQuery,
} from '../registration-queue.query.validation.js';

import type {
  OpdVisitListHttpQuery,
  QueueEntryListHttpQuery,
  RegistrationListHttpQuery,
} from '../registration-queue.validation.js';

import type {
  OpdVisitIdParams,
  QueueEntryIdParams,
  RegistrationIdParams,
} from './registration-queue-command.controller.js';

export class RegistrationQueueQueryController {
  public constructor(
    private readonly application:
      RegistrationQueueApplication,
  ) {}

  public listRegistrations = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const result =
      await this.application
        .services
        .queryService
        .listRegistrations(
          actor.facilityId,

          validatedRegistrationQueuePart<
            RegistrationListHttpQuery
          >(
            request,
            'query',
          ),
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public getRegistrationById = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const params =
      validatedRegistrationQueuePart<
        RegistrationIdParams
      >(
        request,
        'params',
      );

    const query =
      validatedRegistrationQueuePart<
        RegistrationQueueHistoryHttpQuery
      >(
        request,
        'query',
      );

    const result =
      await this.application
        .services
        .queryService
        .getRegistrationById(
          actor.facilityId,
          params.registrationId,
          query.includeReason,
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public getRegistrationByNumber = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const params =
      validatedRegistrationQueuePart<
        RegistrationNumberParams
      >(
        request,
        'params',
      );

    const query =
      validatedRegistrationQueuePart<
        RegistrationQueueHistoryHttpQuery
      >(
        request,
        'query',
      );

    const result =
      await this.application
        .services
        .queryService
        .getRegistrationByNumber(
          actor.facilityId,
          params.registrationNumber,
          query.includeReason,
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public listVisits = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const result =
      await this.application
        .services
        .queryService
        .listVisits(
          actor.facilityId,

          validatedRegistrationQueuePart<
            OpdVisitListHttpQuery
          >(
            request,
            'query',
          ),
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public getVisitById = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const params =
      validatedRegistrationQueuePart<
        OpdVisitIdParams
      >(
        request,
        'params',
      );

    const query =
      validatedRegistrationQueuePart<
        RegistrationQueueHistoryHttpQuery
      >(
        request,
        'query',
      );

    const result =
      await this.application
        .services
        .queryService
        .getVisitById(
          actor.facilityId,
          params.visitId,
          query.includeReason,
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public getVisitByNumber = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const params =
      validatedRegistrationQueuePart<
        OpdVisitNumberParams
      >(
        request,
        'params',
      );

    const query =
      validatedRegistrationQueuePart<
        RegistrationQueueHistoryHttpQuery
      >(
        request,
        'query',
      );

    const result =
      await this.application
        .services
        .queryService
        .getVisitByNumber(
          actor.facilityId,
          params.visitNumber,
          query.includeReason,
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public listQueueEntries = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const result =
      await this.application
        .services
        .queryService
        .listQueueEntries(
          actor.facilityId,

          validatedRegistrationQueuePart<
            QueueEntryListHttpQuery
          >(
            request,
            'query',
          ),
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public getQueueEntry = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const params =
      validatedRegistrationQueuePart<
        QueueEntryIdParams
      >(
        request,
        'params',
      );

    const query =
      validatedRegistrationQueuePart<
        RegistrationQueueHistoryHttpQuery
      >(
        request,
        'query',
      );

    const result =
      await this.application
        .services
        .queryService
        .getQueueEntry(
          actor.facilityId,
          params.queueEntryId,
          query.includeReason,
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public dashboard = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const result =
      await this.application
        .services
        .queryService
        .dashboard(
          actor.facilityId,

          validatedRegistrationQueuePart<
            RegistrationQueueDashboardHttpQuery
          >(
            request,
            'query',
          ),
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public configuration = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const result =
      await this.application
        .services
        .queryService
        .configuration(
          actor.facilityId,

          validatedRegistrationQueuePart<
            RegistrationQueueConfigurationHttpQuery
          >(
            request,
            'query',
          ),
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public publicDisplay = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const actor =
      registrationQueueActorFromRequest(
        request,
      );

    const result =
      await this.application
        .services
        .publicDisplayService
        .getDisplay(
          actor.facilityId,

          validatedRegistrationQueuePart<
            RegistrationQueuePublicDisplayHttpQuery
          >(
            request,
            'query',
          ),
        );

    response
      .status(200)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };
}
import type {
  Request,
  Response,
} from 'express';

import {
  BadRequestError,
  UnauthorizedError,
  createApiSuccess,
} from '@hospital-mis/shared';

import type {
  CreateSettingDefinitionInput,
  FacilityActorContext,
  SettingDefinitionListQuery,
  SystemSettingListQuery,
  UpdateSettingDefinitionInput,
} from './facility.types.js';

import type {
  UpsertSystemSettingInput,
} from './workflows/upsert-system-setting.workflow.js';

import type {
  SettingDefinitionMutationService,
} from './services/setting-definition-mutation.service.js';

import type {
  SettingDefinitionService,
} from './services/setting-definition.service.js';

import type {
  SystemSettingService,
} from './services/system-setting.service.js';

type ValidatedLocation =
  | 'params'
  | 'query'
  | 'body'
  | 'headers';

function validatedPart<T>(
  request:
    Request,

  location:
    ValidatedLocation,
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
      `Validated request ${location} is unavailable`,
    );
  }

  return value as T;
}

function actorFromRequest(
  request:
    Request,
): FacilityActorContext {
  const principal =
    request.auth;

  if (
    principal ===
    undefined
  ) {
    throw new UnauthorizedError();
  }

  const actor:
    FacilityActorContext = {
    userId:
      principal.userId,

    facilityId:
      principal.facilityId,

    correlationId:
      request.correlationId,
  };

  const userAgent =
    request.header(
      'user-agent',
    );

  if (
    userAgent !==
    undefined
  ) {
    actor.userAgent =
      userAgent;
  }

  if (
    request.ip.length >
    0
  ) {
    actor.ipAddress =
      request.ip;
  }

  return actor;
}

function idempotencyKey(
  request:
    Request,
): string {
  const value =
    request
      .header(
        'idempotency-key',
      )
      ?.trim();

  if (
    value === undefined ||
    value.length === 0
  ) {
    throw new BadRequestError(
      'Idempotency-Key header is required',
    );
  }

  return value;
}

interface SettingKeyParams {
  key:
    string;
}

interface SettingIdParams {
  settingId:
    string;
}

interface EffectiveSettingQuery {
  facilityId?:
    string;
}

interface SettingHistoryQuery {
  page:
    number;

  pageSize:
    number;

  sortDirection:
    | 'asc'
    | 'desc';
}

export class ConfigurationController {
  public constructor(
    private readonly definitionService:
      SettingDefinitionService,

    private readonly definitionMutationService:
      SettingDefinitionMutationService,

    private readonly settingService:
      SystemSettingService,
  ) {}

  public listDefinitions = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this.definitionService
        .list(
          validatedPart<
            SettingDefinitionListQuery
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

  public getDefinition = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPart<
        SettingKeyParams
      >(
        request,
        'params',
      );

    const result =
      await this.definitionService
        .getByKey(
          params.key,
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

  public createDefinition = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this
        .definitionMutationService
        .create(
          validatedPart<
            CreateSettingDefinitionInput
          >(
            request,
            'body',
          ),
          actorFromRequest(
            request,
          ),
          idempotencyKey(
            request,
          ),
        );

    response
      .status(201)
      .json(
        createApiSuccess(
          result,
          request.correlationId,
        ),
      );
  };

  public updateDefinition = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPart<
        SettingKeyParams
      >(
        request,
        'params',
      );

    const result =
      await this
        .definitionMutationService
        .update(
          params.key,
          validatedPart<
            UpdateSettingDefinitionInput
          >(
            request,
            'body',
          ),
          actorFromRequest(
            request,
          ),
          idempotencyKey(
            request,
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

  public listSettings = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const result =
      await this.settingService
        .list(
          validatedPart<
            SystemSettingListQuery
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

  public getEffectiveSetting = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const principal =
      request.auth;

    if (
      principal === undefined
    ) {
      throw new UnauthorizedError();
    }

    const params =
      validatedPart<
        SettingKeyParams
      >(
        request,
        'params',
      );

    const query =
      validatedPart<
        EffectiveSettingQuery
      >(
        request,
        'query',
      );

    const result =
      await this.settingService
        .resolveEffective(
          params.key,
          query.facilityId ??
            principal.facilityId,
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

  public upsertSetting = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPart<
        SettingKeyParams
      >(
        request,
        'params',
      );

    const result =
      await this.settingService
        .upsert(
          params.key,
          validatedPart<
            UpsertSystemSettingInput
          >(
            request,
            'body',
          ),
          actorFromRequest(
            request,
          ),
          idempotencyKey(
            request,
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

  public listSettingHistory = async (
    request:
      Request,

    response:
      Response,
  ): Promise<void> => {
    const params =
      validatedPart<
        SettingIdParams
      >(
        request,
        'params',
      );

    const result =
      await this.settingService
        .listHistory(
          params.settingId,
          validatedPart<
            SettingHistoryQuery
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
import {
  AppError,
  type ApiErrorDetail,
} from '@hospital-mis/shared';

export interface IdentityErrorDetails {
  [key: string]: unknown;
}

function detailMessage(
  key: string,
  value: unknown,
): string {
  if (
    key
      .toLocaleLowerCase('en-US')
      .includes('value') ||
    key
      .toLocaleLowerCase('en-US')
      .includes('cnic') ||
    key
      .toLocaleLowerCase('en-US')
      .includes('password') ||
    key
      .toLocaleLowerCase('en-US')
      .includes('token')
  ) {
    return 'The supplied value conflicts with an existing record';
  }

  if (Array.isArray(value)) {
    return `${value.length} related value(s) require attention`;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  return 'Additional identity-domain context is available';
}

function toApiDetails(
  details:
    | IdentityErrorDetails
    | undefined,
): readonly ApiErrorDetail[] {
  if (details === undefined) {
    return [];
  }

  return Object.entries(details).map(
    ([key, value]) => ({
      code: `identity_${key
        .replace(
          /([a-z0-9])([A-Z])/g,
          '$1_$2',
        )
        .toLocaleLowerCase(
          'en-US',
        )}`,

      message:
        detailMessage(
          key,
          value,
        ),

      path:
        key,
    }),
  );
}

export class IdentityDomainError extends AppError {
  public readonly domainDetails:
    IdentityErrorDetails;

  public constructor(
    message: string,

    options: {
      statusCode: number;
      code: string;
      details?: IdentityErrorDetails;
      cause?: unknown;
      expose?: boolean;
      retryable?: boolean;
    },
  ) {
    super({
      message,
      statusCode:
        options.statusCode,

      code:
        options.code,

      details:
        toApiDetails(
          options.details,
        ),

      expose:
        options.expose ??
        true,

      retryable:
        options.retryable ??
        false,

      cause:
        options.cause,
    });

    this.domainDetails =
      options.details ?? {};
  }
}

export class IdentityNotFoundError
  extends IdentityDomainError {
  public constructor(
    entityName: string,
    identifier: string,
    details?: IdentityErrorDetails,
  ) {
    super(
      `${entityName} was not found`,
      {
        statusCode: 404,
        code:
          'IDENTITY_RESOURCE_NOT_FOUND',

        details: {
          entityName,
          identifier,
          ...details,
        },
      },
    );
  }
}

export class IdentityConflictError
  extends IdentityDomainError {
  public constructor(
    message: string,
    code = 'IDENTITY_CONFLICT',
    details?: IdentityErrorDetails,
  ) {
    super(
      message,
      {
        statusCode: 409,
        code,
        details,
      },
    );
  }
}

export class IdentityValidationError
  extends IdentityDomainError {
  public constructor(
    message: string,
    details?: IdentityErrorDetails,
  ) {
    super(
      message,
      {
        statusCode: 400,
        code:
          'IDENTITY_VALIDATION_FAILED',

        details,
      },
    );
  }
}

export class IdentityVersionConflictError
  extends IdentityDomainError {
  public constructor(
    entityName: string,
    entityId: string,
    expectedVersion: number,
  ) {
    super(
      `${entityName} was changed by another operation. Reload and retry.`,
      {
        statusCode: 409,
        code:
          'IDENTITY_VERSION_CONFLICT',

        retryable:
          true,

        details: {
          entityName,
          entityId,
          expectedVersion,
        },
      },
    );
  }
}

export class ProtectedIdentityResourceError
  extends IdentityDomainError {
  public constructor(
    resourceType: string,
    resourceId: string,
    operation: string,
  ) {
    super(
      `The system-managed ${resourceType} cannot be ${operation}`,
      {
        statusCode: 409,
        code:
          'IDENTITY_PROTECTED_RESOURCE',

        details: {
          resourceType,
          resourceId,
          operation,
        },
      },
    );
  }
}

export class InvalidRoleScopeError
  extends IdentityDomainError {
  public constructor(
    roleId: string,
    roleScope: string,
    assignmentFacilityId?:
      | string
      | null,
  ) {
    super(
      'The role scope is incompatible with the requested assignment',
      {
        statusCode: 400,
        code:
          'IDENTITY_INVALID_ROLE_SCOPE',

        details: {
          roleId,
          roleScope,

          assignmentFacilityId:
            assignmentFacilityId ??
            null,
        },
      },
    );
  }
}
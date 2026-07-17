import {
  AppError,
  ConcurrencyConflictError,
  ConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

export class FacilityNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Facility was not found');
  }
}

export class DepartmentNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Department was not found');
  }
}

export class SettingDefinitionNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('Setting definition was not found');
  }
}

export class SystemSettingNotFoundError extends ResourceNotFoundError {
  public constructor() {
    super('System setting was not found');
  }
}

export class FacilityCodeConflictError extends ConflictError {
  public constructor(code: string) {
    super(`Facility code ${code} is already in use`, [
      {
        code: 'facility_code_conflict',
        message: 'Facility code must be unique',
        path: 'body.code',
      },
    ]);
  }
}

export class DepartmentCodeConflictError extends ConflictError {
  public constructor(code: string) {
    super(`Department code ${code} is already in use in this facility`, [
      {
        code: 'department_code_conflict',
        message: 'Department code must be unique within the facility',
        path: 'body.code',
      },
    ]);
  }
}

export class SettingDefinitionKeyConflictError extends ConflictError {
  public constructor(key: string) {
    super(`Setting definition ${key} already exists`, [
      {
        code: 'setting_definition_key_conflict',
        message: 'Setting definition keys must be unique',
        path: 'body.key',
      },
    ]);
  }
}

export class SettingScopeConflictError extends ConflictError {
  public constructor(key: string) {
    super(`A value for setting ${key} already exists in this scope`, [
      {
        code: 'setting_scope_conflict',
        message: 'Only one value is allowed for each setting and scope',
        path: 'body.key',
      },
    ]);
  }
}

export class FacilityConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The facility changed before the update could be completed');
  }
}

export class DepartmentConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The department changed before the update could be completed');
  }
}

export class SettingDefinitionConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super(
      'The setting definition changed before the update could be completed',
    );
  }
}

export class SystemSettingConcurrencyError extends ConcurrencyConflictError {
  public constructor() {
    super('The setting changed before the update could be completed');
  }
}

export class InvalidSettingValueError extends AppError {
  public constructor(
    message: string,
    path = 'body.value',
  ) {
    super({
      code: 'INVALID_SETTING_VALUE',
      message,
      statusCode: 422,
      details: [
        {
          code: 'invalid_setting_value',
          message,
          path,
        },
      ],
    });
  }
}

export class SensitiveSettingReadForbiddenError extends ForbiddenError {
  public constructor() {
    super('Sensitive setting values cannot be returned by this endpoint');
  }
}

export class SensitiveSettingConfigurationError extends AppError {
  public constructor(message: string) {
    super({
      code: 'SENSITIVE_SETTING_CONFIGURATION_ERROR',
      message,
      statusCode: 500,
      expose: false,
    });
  }
}

export class UnsupportedSettingScopeError extends AppError {
  public constructor(
    key: string,
    scope: string,
  ) {
    super({
      code: 'UNSUPPORTED_SETTING_SCOPE',
      message: `Setting ${key} cannot be configured at scope ${scope}`,
      statusCode: 422,
      details: [
        {
          code: 'unsupported_setting_scope',
          message: `Scope ${scope} is not permitted for this setting`,
          path: 'body.scope',
        },
      ],
    });
  }
}

export class ImmutableSettingDefinitionError extends ConflictError {
  public constructor(key: string) {
    super(`Setting ${key} is immutable and cannot be changed`);
  }
}

export class InactiveFacilityError extends ForbiddenError {
  public constructor() {
    super('The selected facility is inactive');
  }
}

export class FacilityAuthenticationDisabledError extends ForbiddenError {
  public constructor() {
    super('Authentication is disabled for the selected facility');
  }
}

export class InvalidFacilityHierarchyError extends ConflictError {
  public constructor(message: string) {
    super(message);
  }
}

export class InvalidDepartmentHierarchyError extends ConflictError {
  public constructor(message: string) {
    super(message);
  }
}
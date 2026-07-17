import type {
  PolicyDecision,
  RecordAccessPolicy,
} from '../authorization/authorization.middleware.js';

import type {
  AuthorizationService,
} from '../authorization/authorization.service.js';

import type {
  DepartmentDto,
  FacilityDto,
  SettingDefinitionDto,
  SystemSettingDto,
} from './facility.types.js';

function allow():
  PolicyDecision {
  return {
    allowed:
      true,
  };
}

function deny(
  reason:
    string,
): PolicyDecision {
  return {
    allowed:
      false,

    reason,
  };
}

export class FacilityRecordPolicy
implements RecordAccessPolicy<FacilityDto> {
  public readonly name =
    'facility-record-policy';

  public constructor(
    private readonly authorization:
      AuthorizationService,
  ) {}

  public async evaluate(
    context:
      Parameters<
        RecordAccessPolicy<FacilityDto>[
          'evaluate'
        ]
      >[0],
  ): Promise<PolicyDecision> {
    if (
      context.record.id ===
      context.principal.facilityId
    ) {
      return allow();
    }

    if (
      await this.authorization.hasPermission(
        context.principal,
        'facilities.manage_all',
      )
    ) {
      return allow();
    }

    return deny(
      'The facility record is outside the authenticated facility context',
    );
  }
}

export class DepartmentRecordPolicy
implements RecordAccessPolicy<DepartmentDto> {
  public readonly name =
    'department-record-policy';

  public constructor(
    private readonly authorization:
      AuthorizationService,
  ) {}

  public async evaluate(
    context:
      Parameters<
        RecordAccessPolicy<DepartmentDto>[
          'evaluate'
        ]
      >[0],
  ): Promise<PolicyDecision> {
    if (
      context.record.facilityId ===
      context.principal.facilityId
    ) {
      return allow();
    }

    if (
      await this.authorization.hasPermission(
        context.principal,
        'facilities.manage_all',
      )
    ) {
      return allow();
    }

    return deny(
      'The department belongs to another facility',
    );
  }
}

export class SettingDefinitionRecordPolicy
implements RecordAccessPolicy<SettingDefinitionDto> {
  public readonly name =
    'setting-definition-record-policy';

  public async evaluate():
    Promise<PolicyDecision> {
    /*
     * Definitions are global metadata. Route-level permission checks still
     * control whether they can be listed, read, or changed.
     */
    return allow();
  }
}

export class SystemSettingRecordPolicy
implements RecordAccessPolicy<SystemSettingDto> {
  public readonly name =
    'system-setting-record-policy';

  public constructor(
    private readonly authorization:
      AuthorizationService,
  ) {}

  public async evaluate(
    context:
      Parameters<
        RecordAccessPolicy<SystemSettingDto>[
          'evaluate'
        ]
      >[0],
  ): Promise<PolicyDecision> {
    if (
      context.record.scope ===
      'GLOBAL'
    ) {
      return allow();
    }

    if (
      context.record.facilityId ===
      context.principal.facilityId
    ) {
      return allow();
    }

    if (
      await this.authorization.hasPermission(
        context.principal,
        'facilities.manage_all',
      )
    ) {
      return allow();
    }

    return deny(
      'The setting belongs to another facility',
    );
  }
}

export interface FacilityRecordPolicies {
  facility:
    FacilityRecordPolicy;

  department:
    DepartmentRecordPolicy;

  settingDefinition:
    SettingDefinitionRecordPolicy;

  systemSetting:
    SystemSettingRecordPolicy;
}

export function createFacilityRecordPolicies(
  authorization:
    AuthorizationService,
): FacilityRecordPolicies {
  return {
    facility:
      new FacilityRecordPolicy(
        authorization,
      ),

    department:
      new DepartmentRecordPolicy(
        authorization,
      ),

    settingDefinition:
      new SettingDefinitionRecordPolicy(),

    systemSetting:
      new SystemSettingRecordPolicy(
        authorization,
      ),
  };
}
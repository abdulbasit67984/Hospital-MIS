import {
  Types,
} from 'mongoose';

import {
  toObjectId,
} from '@hospital-mis/database';

import {
  AdmissionConcurrencyError,
  AdmissionNotFoundError,
  AdmissionRecommendationConcurrencyError,
  AdmissionRecommendationNotFoundError,
  InpatientBedConcurrencyError,
  InpatientBedNotFoundError,
  InpatientBedRateConcurrencyError,
  InpatientBedRateNotFoundError,
  InpatientDepartmentUnavailableError,
  InpatientLocationHierarchyError,
  InpatientMinimumNecessaryAccessError,
  InpatientRoomConcurrencyError,
  InpatientRoomNotFoundError,
  InpatientServicePointMismatchError,
  InpatientWardConcurrencyError,
  InpatientWardNotFoundError,
} from '../inpatient.errors.js';

import {
  displayInpatientText,
  normalizeInpatientCode,
  normalizeInpatientText,
  nullableInpatientText,
  uniqueInpatientCodes,
} from '../inpatient.normalization.js';

import type {
  InpatientAccessAction,
  InpatientAccessPolicyPort,
  InpatientAuditPort,
  InpatientClockPort,
  InpatientContextPort,
  InpatientLocationRepositoryPort,
  InpatientOutboxPort,
  InpatientRealtimePort,
  InpatientSequencePort,
  InpatientTransactionManagerPort,
} from '../inpatient.ports.js';

import type {
  AdmissionRecommendationRecord,
  AdmissionRecord,
  BedRateRecord,
  BedRecord,
  RoomRecord,
  WardRecord,
} from '../inpatient.persistence.types.js';

import type {
  InpatientActorContext,
} from '../inpatient.types.js';

import type {
  InpatientSnapshotCryptoPort,
} from '../inpatient.mutation-snapshots.js';

export interface InpatientConfigurationDepartment {
  id:
    string;

  facilityId:
    string;

  isClinical:
    boolean;

  status:
    'ACTIVE' |
    'INACTIVE';
}

export interface InpatientConfigurationServicePoint {
  id:
    string;

  facilityId:
    string;

  departmentId:
    string;

  status:
    'ACTIVE' |
    'INACTIVE';
}

export interface InpatientConfigurationContextPort {
  findDepartment(
    facilityId:
      string,

    departmentId:
      string,
  ): Promise<
    InpatientConfigurationDepartment | null
  >;

  findServicePoint(
    facilityId:
      string,

    servicePointId:
      string,
  ): Promise<
    InpatientConfigurationServicePoint | null
  >;
}

export interface InpatientCommandDependencies {
  transactionManager:
    InpatientTransactionManagerPort;

  audit:
    InpatientAuditPort;

  outbox:
    InpatientOutboxPort;

  realtime:
    InpatientRealtimePort;

  clock:
    InpatientClockPort;

  sequence:
    InpatientSequencePort;

  snapshotCrypto:
    InpatientSnapshotCryptoPort;
}

export class InpatientCommandService {
  public constructor(
    public readonly locations:
      InpatientLocationRepositoryPort,

    public readonly admissions:
      import('../inpatient.ports.js')
        .InpatientAdmissionRepositoryPort,

    public readonly context:
      InpatientContextPort,

    public readonly configurationContext:
      InpatientConfigurationContextPort,

    public readonly accessPolicy:
      InpatientAccessPolicyPort,

    public readonly dependencies:
      InpatientCommandDependencies,
  ) {}

  public newId():
    string {
    return new Types.ObjectId()
      .toHexString();
  }

  public objectId(
    value:
      string,

    fieldName:
      string,
  ): Types.ObjectId {
    return toObjectId(
      value,
      fieldName,
    );
  }

  public objectIds(
    values:
      readonly string[],

    fieldName:
      string,
  ): Types.ObjectId[] {
    return values.map(
      (
        value,
        index,
      ) =>
        this.objectId(
          value,
          `${fieldName}[${index}]`,
        ),
    );
  }

  public normalizedCode(
    value:
      string,
  ): string {
    return normalizeInpatientCode(
      value,
    );
  }

  public normalizedCodes(
    values:
      readonly string[],
  ): string[] {
    return uniqueInpatientCodes(
      values,
    );
  }

  public normalizedText(
    value:
      string,
  ): string {
    return normalizeInpatientText(
      value,
    );
  }

  public displayText(
    value:
      string,
  ): string {
    return displayInpatientText(
      value,
    );
  }

  public nullableText(
    value:
      string |
      null |
      undefined,
  ): string | null {
    return nullableInpatientText(
      value,
    );
  }

  public async assertAccess(
    actor:
      InpatientActorContext,

    action:
      InpatientAccessAction,

    context:
      Omit<
        import('../inpatient.ports.js')
          .InpatientAccessRequest,
        'actor' |
        'action'
      > = {},
  ): Promise<void> {
    const decision =
      await this.accessPolicy.authorize({
        action,
        actor,
        ...context,
      });

    if (
      !decision.allowed
    ) {
      throw new InpatientMinimumNecessaryAccessError();
    }
  }

  public async actorStaffId(
    actor:
      InpatientActorContext,
  ): Promise<string> {
    return this.accessPolicy
      .requireActiveActorStaffId(
        actor,
      );
  }

  public assertExpectedVersion(
    record:
      {
        version:
          number;
      },

    expectedVersion:
      number,

    entity:
      'WARD' |
      'ROOM' |
      'BED' |
      'BED_RATE' |
      'RECOMMENDATION' |
      'ADMISSION',
  ): void {
    if (
      record.version ===
      expectedVersion
    ) {
      return;
    }

    switch (
      entity
    ) {
      case 'WARD':
        throw new InpatientWardConcurrencyError();

      case 'ROOM':
        throw new InpatientRoomConcurrencyError();

      case 'BED':
        throw new InpatientBedConcurrencyError();

      case 'BED_RATE':
        throw new InpatientBedRateConcurrencyError();

      case 'RECOMMENDATION':
        throw new AdmissionRecommendationConcurrencyError();

      case 'ADMISSION':
        throw new AdmissionConcurrencyError();
    }
  }

  public async requireWard(
    actor:
      InpatientActorContext,

    wardId:
      string,
  ): Promise<
    WardRecord
  > {
    const ward =
      await this.locations.findWardById(
        actor.facilityId,
        wardId,
      );

    if (
      ward === null
    ) {
      throw new InpatientWardNotFoundError();
    }

    return ward;
  }

  public async requireRoom(
    actor:
      InpatientActorContext,

    roomId:
      string,
  ): Promise<
    RoomRecord
  > {
    const room =
      await this.locations.findRoomById(
        actor.facilityId,
        roomId,
      );

    if (
      room === null
    ) {
      throw new InpatientRoomNotFoundError();
    }

    return room;
  }

  public async requireBed(
    actor:
      InpatientActorContext,

    bedId:
      string,
  ): Promise<
    BedRecord
  > {
    const bed =
      await this.locations.findBedById(
        actor.facilityId,
        bedId,
      );

    if (
      bed === null
    ) {
      throw new InpatientBedNotFoundError();
    }

    return bed;
  }

  public async requireBedRate(
    actor:
      InpatientActorContext,

    bedRateId:
      string,
  ): Promise<
    BedRateRecord
  > {
    const rate =
      await this.locations.findBedRateById(
        actor.facilityId,
        bedRateId,
      );

    if (
      rate === null
    ) {
      throw new InpatientBedRateNotFoundError();
    }

    return rate;
  }

  public async requireRecommendation(
    actor:
      InpatientActorContext,

    recommendationId:
      string,
  ): Promise<
    AdmissionRecommendationRecord
  > {
    const recommendation =
      await this.admissions
        .findRecommendationById(
          actor.facilityId,
          recommendationId,
        );

    if (
      recommendation === null
    ) {
      throw new AdmissionRecommendationNotFoundError();
    }

    return recommendation;
  }

  public async requireAdmission(
    actor:
      InpatientActorContext,

    admissionId:
      string,
  ): Promise<
    AdmissionRecord
  > {
    const admission =
      await this.admissions.findAdmissionById(
        actor.facilityId,
        admissionId,
      );

    if (
      admission === null
    ) {
      throw new AdmissionNotFoundError();
    }

    return admission;
  }

  public async assertClinicalDepartment(
    facilityId:
      string,

    departmentId:
      string,
  ): Promise<void> {
    const department =
      await this.configurationContext
        .findDepartment(
          facilityId,
          departmentId,
        );

    if (
      department === null ||
      department.facilityId !==
        facilityId ||
      department.status !==
        'ACTIVE' ||
      !department.isClinical
    ) {
      throw new InpatientDepartmentUnavailableError();
    }
  }

  public async assertServicePoint(
    facilityId:
      string,

    departmentId:
      string,

    servicePointId:
      string |
      null |
      undefined,
  ): Promise<void> {
    if (
      servicePointId == null
    ) {
      return;
    }

    const servicePoint =
      await this.configurationContext
        .findServicePoint(
          facilityId,
          servicePointId,
        );

    if (
      servicePoint === null ||
      servicePoint.facilityId !==
        facilityId ||
      servicePoint.status !==
        'ACTIVE' ||
      servicePoint.departmentId !==
        departmentId
    ) {
      throw new InpatientServicePointMismatchError();
    }
  }

  public assertRoomHierarchy(
    ward:
      WardRecord,

    room:
      RoomRecord,
  ): void {
    if (
      room.wardId.toHexString() !==
        ward._id.toHexString()
    ) {
      throw new InpatientLocationHierarchyError(
        'The room does not belong to the selected ward',
      );
    }

    if (
      room.departmentId.toHexString() !==
        ward.departmentId.toHexString()
    ) {
      throw new InpatientLocationHierarchyError(
        'The room and ward must belong to the same department',
      );
    }
  }

  public assertBedHierarchy(
    ward:
      WardRecord,

    room:
      RoomRecord,

    bed:
      BedRecord,
  ): void {
    this.assertRoomHierarchy(
      ward,
      room,
    );

    if (
      bed.wardId.toHexString() !==
        ward._id.toHexString() ||
      bed.roomId.toHexString() !==
        room._id.toHexString()
    ) {
      throw new InpatientLocationHierarchyError(
        'The bed does not belong to the selected room and ward',
      );
    }
  }

  public auditActorFields(
    actor:
      InpatientActorContext,
  ): Pick<
    import('../inpatient.ports.js')
      .InpatientAuditEntry,
    | 'actorUserId'
    | 'facilityId'
    | 'correlationId'
    | 'ipAddress'
    | 'userAgent'
  > {
    return {
      actorUserId:
        actor.userId,

      facilityId:
        actor.facilityId,

      correlationId:
        actor.correlationId,

      ...(
        actor.ipAddress ===
        undefined
          ? {}
          : {
              ipAddress:
                actor.ipAddress,
            }
      ),

      ...(
        actor.userAgent ===
        undefined
          ? {}
          : {
              userAgent:
                actor.userAgent,
            }
      ),
    };
  }

  public deduplicationKey(
    transactionId:
      string,

    action:
      string,

    entityId:
      string,
  ): string {
    return [
      transactionId,
      action,
      entityId,
    ].join(':');
  }
}
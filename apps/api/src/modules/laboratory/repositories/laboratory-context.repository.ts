import type {
  ClinicalConfidentiality,
  EncounterStatus,
} from '@hospital-mis/database';

import {
  EncounterModel,
  UserModel,
  toObjectId,
} from '@hospital-mis/database';

export interface LaboratoryEncounterContextRecord {
  id: string;
  facilityId: string;
  patientId: string;
  requestedPatientId: string;
  canonicalRedirected: boolean;
  status: EncounterStatus;
  confidentiality: ClinicalConfidentiality;
  registrationId: string | null;
  opdVisitId: string | null;
  queueTokenId: string | null;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  primaryProviderId: string;
  currentOwnerId: string;
  assignedProviderIds: string[];
}

export interface LaboratoryActorIdentityRecord {
  userId: string;
  facilityId: string | null;
  staffId: string | null;
  status:
    | 'ACTIVE'
    | 'LOCKED'
    | 'DISABLED';
}

function id(
  value: {
    toHexString(): string;
  } | null,
): string | null {
  return value?.toHexString() ?? null;
}

export class LaboratoryContextRepository {
  public async findEncounter(
    facilityId: string,
    encounterId: string,
  ): Promise<LaboratoryEncounterContextRecord | null> {
    const record =
      await EncounterModel.findOne({
        _id:
          toObjectId(
            encounterId,
            'encounterId',
          ),
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          [
            '_id',
            'facilityId',
            'patientId',
            'requestedPatientId',
            'canonicalRedirected',
            'status',
            'confidentiality',
            'registrationId',
            'opdVisitId',
            'queueTokenId',
            'departmentId',
            'clinicId',
            'servicePointId',
            'primaryProviderId',
            'currentOwnerId',
            'assignedProviderIds',
          ].join(' '),
        )
        .lean<{
          _id: { toHexString(): string };
          facilityId: { toHexString(): string };
          patientId: { toHexString(): string };
          requestedPatientId: { toHexString(): string };
          canonicalRedirected: boolean;
          status: EncounterStatus;
          confidentiality: ClinicalConfidentiality;
          registrationId: { toHexString(): string } | null;
          opdVisitId: { toHexString(): string } | null;
          queueTokenId: { toHexString(): string } | null;
          departmentId: { toHexString(): string };
          clinicId: { toHexString(): string } | null;
          servicePointId: { toHexString(): string } | null;
          primaryProviderId: { toHexString(): string };
          currentOwnerId: { toHexString(): string };
          assignedProviderIds: Array<{ toHexString(): string }>;
        }>()
        .exec();

    if (record === null) {
      return null;
    }

    const assignedProviderIds =
      new Set(
        record.assignedProviderIds.map(
          (providerId) => providerId.toHexString(),
        ),
      );

    assignedProviderIds.add(
      record.primaryProviderId.toHexString(),
    );

    assignedProviderIds.add(
      record.currentOwnerId.toHexString(),
    );

    return {
      id: record._id.toHexString(),
      facilityId: record.facilityId.toHexString(),
      patientId: record.patientId.toHexString(),
      requestedPatientId: record.requestedPatientId.toHexString(),
      canonicalRedirected: record.canonicalRedirected,
      status: record.status,
      confidentiality: record.confidentiality,
      registrationId: id(record.registrationId),
      opdVisitId: id(record.opdVisitId),
      queueTokenId: id(record.queueTokenId),
      departmentId: record.departmentId.toHexString(),
      clinicId: id(record.clinicId),
      servicePointId: id(record.servicePointId),
      primaryProviderId: record.primaryProviderId.toHexString(),
      currentOwnerId: record.currentOwnerId.toHexString(),
      assignedProviderIds: [...assignedProviderIds],
    };
  }

  public async findActorIdentity(
    userId: string,
  ): Promise<LaboratoryActorIdentityRecord | null> {
    const record =
      await UserModel.findById(
        toObjectId(
          userId,
          'userId',
        ),
      )
        .select('_id facilityId staffId status')
        .lean<{
          _id: { toHexString(): string };
          facilityId: { toHexString(): string } | null;
          staffId: { toHexString(): string } | null;
          status: LaboratoryActorIdentityRecord['status'];
        }>()
        .exec();

    return record === null
      ? null
      : {
          userId: record._id.toHexString(),
          facilityId: id(record.facilityId),
          staffId: id(record.staffId),
          status: record.status,
        };
  }
}
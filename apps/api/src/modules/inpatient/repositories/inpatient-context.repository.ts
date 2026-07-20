import type {
  ClinicalConfidentiality,
  EncounterStatus,
  PatientSexAtBirth,
  PatientStatus,
} from '@hospital-mis/database';

import {
  DepartmentModel,
  EncounterModel,
  PatientModel,
  ServicePointModel,
  StaffModel,
  UserModel,
  toObjectId,
} from '@hospital-mis/database';

export interface InpatientActorIdentityRecord {
  userId:
    string;

  facilityId:
    string | null;

  staffId:
    string | null;

  status:
    | 'ACTIVE'
    | 'LOCKED'
    | 'DISABLED';
}

export interface InpatientPatientContextRecord {
  id:
    string;

  facilityId:
    string;

  status:
    PatientStatus;

  sexAtBirth:
    PatientSexAtBirth;

  birthDateValue:
    Date | null;

  estimatedAgeYears:
    number | null;

  isMinor:
    boolean;
}

export interface InpatientEncounterContextRecord {
  id:
    string;

  facilityId:
    string;

  patientId:
    string;

  requestedPatientId:
    string;

  canonicalRedirected:
    boolean;

  status:
    EncounterStatus;

  confidentiality:
    ClinicalConfidentiality;

  registrationId:
    string | null;

  opdVisitId:
    string | null;

  queueTokenId:
    string | null;

  departmentId:
    string;

  clinicId:
    string | null;

  servicePointId:
    string | null;

  primaryProviderId:
    string;

  currentOwnerId:
    string;

  assignedProviderIds:
    string[];
}

export interface InpatientDepartmentContextRecord {
  id:
    string;

  facilityId:
    string;

  code:
    string;

  name:
    string;

  isClinical:
    boolean;

  status:
    | 'ACTIVE'
    | 'INACTIVE';
}

export interface InpatientServicePointContextRecord {
  id:
    string;

  facilityId:
    string;

  departmentId:
    string;

  clinicId:
    string | null;

  code:
    string;

  name:
    string;

  servicePointType:
    string;

  status:
    | 'ACTIVE'
    | 'INACTIVE';
}

export interface InpatientStaffContextRecord {
  id:
    string;

  facilityId:
    string;

  departmentId:
    string | null;

  displayName:
    string;

  designation:
    string | null;

  professionalType:
    string | null;

  employmentStatus:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'ON_LEAVE'
    | 'SUSPENDED'
    | 'TERMINATED';

  isClinical:
    boolean;

  isActive:
    boolean;
}

function id(
  value:
    {
      toHexString():
        string;
    } |
    null,
): string | null {
  return (
    value?.toHexString() ??
    null
  );
}

export class InpatientContextRepository {
  public async findActorIdentity(
    userId:
      string,
  ): Promise<
    InpatientActorIdentityRecord | null
  > {
    const record =
      await UserModel.findById(
        toObjectId(
          userId,
          'userId',
        ),
      )
        .select(
          '_id facilityId staffId status',
        )
        .lean<{
          _id: {
            toHexString():
              string;
          };

          facilityId: {
            toHexString():
              string;
          } | null;

          staffId: {
            toHexString():
              string;
          } | null;

          status:
            InpatientActorIdentityRecord[
              'status'
            ];
        }>()
        .exec();

    return record === null
      ? null
      : {
          userId:
            record
              ._id
              .toHexString(),

          facilityId:
            id(
              record.facilityId,
            ),

          staffId:
            id(
              record.staffId,
            ),

          status:
            record.status,
        };
  }

  public async findPatient(
    facilityId:
      string,

    patientId:
      string,
  ): Promise<
    InpatientPatientContextRecord | null
  > {
    const record =
      await PatientModel.findOne({
        _id:
          toObjectId(
            patientId,
            'patientId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '_id facilityId status sexAtBirth +birthDate.value birthDate.estimatedAgeYears isMinor',
        )
        .lean<{
          _id: {
            toHexString():
              string;
          };

          facilityId: {
            toHexString():
              string;
          };

          status:
            PatientStatus;

          sexAtBirth:
            PatientSexAtBirth;

          birthDate: {
            value:
              Date | null;

            estimatedAgeYears:
              number | null;
          };

          isMinor:
            boolean;
        }>()
        .exec();

    return record === null
      ? null
      : {
          id:
            record
              ._id
              .toHexString(),

          facilityId:
            record
              .facilityId
              .toHexString(),

          status:
            record.status,

          sexAtBirth:
            record.sexAtBirth,

          birthDateValue:
            record
              .birthDate
              .value,

          estimatedAgeYears:
            record
              .birthDate
              .estimatedAgeYears,

          isMinor:
            record.isMinor,
        };
  }

  public async findEncounter(
    facilityId:
      string,

    encounterId:
      string,
  ): Promise<
    InpatientEncounterContextRecord | null
  > {
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
          _id: {
            toHexString():
              string;
          };

          facilityId: {
            toHexString():
              string;
          };

          patientId: {
            toHexString():
              string;
          };

          requestedPatientId: {
            toHexString():
              string;
          };

          canonicalRedirected:
            boolean;

          status:
            EncounterStatus;

          confidentiality:
            ClinicalConfidentiality;

          registrationId: {
            toHexString():
              string;
          } | null;

          opdVisitId: {
            toHexString():
              string;
          } | null;

          queueTokenId: {
            toHexString():
              string;
          } | null;

          departmentId: {
            toHexString():
              string;
          };

          clinicId: {
            toHexString():
              string;
          } | null;

          servicePointId: {
            toHexString():
              string;
          } | null;

          primaryProviderId: {
            toHexString():
              string;
          };

          currentOwnerId: {
            toHexString():
              string;
          };

          assignedProviderIds:
            Array<{
              toHexString():
                string;
            }>;
        }>()
        .exec();

    if (
      record === null
    ) {
      return null;
    }

    const assignedProviderIds =
      new Set(
        record
          .assignedProviderIds
          .map(
            (providerId) =>
              providerId
                .toHexString(),
          ),
      );

    assignedProviderIds.add(
      record
        .primaryProviderId
        .toHexString(),
    );

    assignedProviderIds.add(
      record
        .currentOwnerId
        .toHexString(),
    );

    return {
      id:
        record
          ._id
          .toHexString(),

      facilityId:
        record
          .facilityId
          .toHexString(),

      patientId:
        record
          .patientId
          .toHexString(),

      requestedPatientId:
        record
          .requestedPatientId
          .toHexString(),

      canonicalRedirected:
        record.canonicalRedirected,

      status:
        record.status,

      confidentiality:
        record.confidentiality,

      registrationId:
        id(
          record.registrationId,
        ),

      opdVisitId:
        id(
          record.opdVisitId,
        ),

      queueTokenId:
        id(
          record.queueTokenId,
        ),

      departmentId:
        record
          .departmentId
          .toHexString(),

      clinicId:
        id(
          record.clinicId,
        ),

      servicePointId:
        id(
          record.servicePointId,
        ),

      primaryProviderId:
        record
          .primaryProviderId
          .toHexString(),

      currentOwnerId:
        record
          .currentOwnerId
          .toHexString(),

      assignedProviderIds:
        [
          ...assignedProviderIds,
        ],
    };
  }

  public async findDepartment(
    facilityId:
      string,

    departmentId:
      string,
  ): Promise<
    InpatientDepartmentContextRecord | null
  > {
    const record =
      await DepartmentModel.findOne({
        _id:
          toObjectId(
            departmentId,
            'departmentId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '_id facilityId code name isClinical status',
        )
        .lean<{
          _id: {
            toHexString():
              string;
          };

          facilityId: {
            toHexString():
              string;
          };

          code:
            string;

          name:
            string;

          isClinical:
            boolean;

          status:
            | 'ACTIVE'
            | 'INACTIVE';
        }>()
        .exec();

    return record === null
      ? null
      : {
          id:
            record
              ._id
              .toHexString(),

          facilityId:
            record
              .facilityId
              .toHexString(),

          code:
            record.code,

          name:
            record.name,

          isClinical:
            record.isClinical,

          status:
            record.status,
        };
  }

  public async findServicePoint(
    facilityId:
      string,

    servicePointId:
      string,
  ): Promise<
    InpatientServicePointContextRecord | null
  > {
    const record =
      await ServicePointModel.findOne({
        _id:
          toObjectId(
            servicePointId,
            'servicePointId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '_id facilityId departmentId clinicId code name servicePointType status',
        )
        .lean<{
          _id: {
            toHexString():
              string;
          };

          facilityId: {
            toHexString():
              string;
          };

          departmentId: {
            toHexString():
              string;
          };

          clinicId: {
            toHexString():
              string;
          } | null;

          code:
            string;

          name:
            string;

          servicePointType:
            string;

          status:
            | 'ACTIVE'
            | 'INACTIVE';
        }>()
        .exec();

    return record === null
      ? null
      : {
          id:
            record
              ._id
              .toHexString(),

          facilityId:
            record
              .facilityId
              .toHexString(),

          departmentId:
            record
              .departmentId
              .toHexString(),

          clinicId:
            id(
              record.clinicId,
            ),

          code:
            record.code,

          name:
            record.name,

          servicePointType:
            record.servicePointType,

          status:
            record.status,
        };
  }

  public async findStaff(
    facilityId:
      string,

    staffId:
      string,
  ): Promise<
    InpatientStaffContextRecord | null
  > {
    const record =
      await StaffModel.findOne({
        _id:
          toObjectId(
            staffId,
            'staffId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '_id facilityId departmentId displayName designation professionalType employmentStatus isClinical isActive',
        )
        .lean<{
          _id: {
            toHexString():
              string;
          };

          facilityId: {
            toHexString():
              string;
          };

          departmentId: {
            toHexString():
              string;
          } | null;

          displayName:
            string;

          designation:
            string | null;

          professionalType:
            string | null;

          employmentStatus:
            InpatientStaffContextRecord[
              'employmentStatus'
            ];

          isClinical:
            boolean;

          isActive:
            boolean;
        }>()
        .exec();

    return record === null
      ? null
      : {
          id:
            record
              ._id
              .toHexString(),

          facilityId:
            record
              .facilityId
              .toHexString(),

          departmentId:
            id(
              record.departmentId,
            ),

          displayName:
            record.displayName,

          designation:
            record.designation,

          professionalType:
            record.professionalType,

          employmentStatus:
            record.employmentStatus,

          isClinical:
            record.isClinical,

          isActive:
            record.isActive,
        };
  }
}
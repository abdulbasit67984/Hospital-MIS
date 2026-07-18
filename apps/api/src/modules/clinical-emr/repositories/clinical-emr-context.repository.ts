import type {
  OpdVisitStatus,
  QueueEntryStatus,
  RegistrationStatus,
} from '@hospital-mis/database';

import {
  DepartmentModel,
  FacilityModel,
  OpdClinicModel,
  OpdVisitModel,
  QueueTokenModel,
  RegistrationModel,
  ServicePointModel,
  StaffModel,
  UserModel,
  toObjectId,
} from '@hospital-mis/database';

export interface ClinicalFacilityContextRecord {
  id: string;
  code: string;
  name: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ClinicalDepartmentContextRecord {
  id: string;
  facilityId: string;
  code: string;
  name: string;
  isClinical: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ClinicalClinicContextRecord {
  id: string;
  facilityId: string;
  departmentId: string;
  code: string;
  name: string;
  defaultProviderId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ClinicalServicePointContextRecord {
  id: string;
  facilityId: string;
  departmentId: string;
  clinicId: string | null;
  code: string;
  name: string;
  servicePointType: string;
  defaultProviderId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ClinicalProviderContextRecord {
  id: string;
  facilityId: string;
  departmentId: string | null;
  employeeNumber: string;
  displayName: string;
  designation: string | null;
  professionalType: string | null;
  employmentStatus:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'ON_LEAVE'
    | 'SUSPENDED'
    | 'TERMINATED';
  isClinical: boolean;
  isActive: boolean;
}

export interface ClinicalRegistrationContextRecord {
  id: string;
  facilityId: string;
  patientId: string;
  requestedPatientId: string;
  status: RegistrationStatus;
  serviceDate: string;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  emergencyCaseId: string | null;
  referralId: string | null;
}

export interface ClinicalOpdVisitContextRecord {
  id: string;
  facilityId: string;
  registrationId: string;
  patientId: string;
  requestedPatientId: string;
  serviceDate: string;
  status: OpdVisitStatus;
  departmentId: string;
  clinicId: string | null;
  servicePointId: string | null;
  assignedProviderId: string | null;
  assignedCounterId: string | null;
  currentQueueTokenId: string | null;
}

export interface ClinicalQueueContextRecord {
  id: string;
  facilityId: string;
  registrationId: string;
  opdVisitId: string;
  patientId: string;
  queueDefinitionId: string;
  serviceDate: string;
  status: QueueEntryStatus;
  assignedProviderId: string | null;
  assignedCounterId: string | null;
  queuedAt: Date;
  calledAt: Date | null;
  servingAt: Date | null;
}

export interface ClinicalActorIdentityRecord {
  userId: string;
  facilityId: string | null;
  staffId: string | null;
  status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
}

function idText(
  value: { toHexString(): string } | null | undefined,
): string | null {
  return value?.toHexString() ?? null;
}

export class ClinicalEmrContextRepository {
  public async findFacility(
    facilityId: string,
  ): Promise<ClinicalFacilityContextRecord | null> {
    const record = await FacilityModel.findById(
      toObjectId(facilityId, 'facilityId'),
    )
      .select('_id code name timezone status')
      .lean<{
        _id: { toHexString(): string };
        code: string;
        name: string;
        timezone: string;
        status: 'ACTIVE' | 'INACTIVE';
      }>()
      .exec();

    return record === null
      ? null
      : {
          id: record._id.toHexString(),
          code: record.code,
          name: record.name,
          timezone: record.timezone,
          status: record.status,
        };
  }

  public async findDepartment(
    facilityId: string,
    departmentId: string,
  ): Promise<ClinicalDepartmentContextRecord | null> {
    const record = await DepartmentModel.findOne({
      _id: toObjectId(departmentId, 'departmentId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select('_id facilityId code name isClinical status')
      .lean<{
        _id: { toHexString(): string };
        facilityId: { toHexString(): string };
        code: string;
        name: string;
        isClinical: boolean;
        status: 'ACTIVE' | 'INACTIVE';
      }>()
      .exec();

    return record === null
      ? null
      : {
          id: record._id.toHexString(),
          facilityId: record.facilityId.toHexString(),
          code: record.code,
          name: record.name,
          isClinical: record.isClinical,
          status: record.status,
        };
  }

  public async findClinic(
    facilityId: string,
    clinicId: string,
  ): Promise<ClinicalClinicContextRecord | null> {
    const record = await OpdClinicModel.findOne({
      _id: toObjectId(clinicId, 'clinicId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select('_id facilityId departmentId code name defaultProviderId status')
      .lean<{
        _id: { toHexString(): string };
        facilityId: { toHexString(): string };
        departmentId: { toHexString(): string };
        code: string;
        name: string;
        defaultProviderId: { toHexString(): string } | null;
        status: 'ACTIVE' | 'INACTIVE';
      }>()
      .exec();

    return record === null
      ? null
      : {
          id: record._id.toHexString(),
          facilityId: record.facilityId.toHexString(),
          departmentId: record.departmentId.toHexString(),
          code: record.code,
          name: record.name,
          defaultProviderId: idText(record.defaultProviderId),
          status: record.status,
        };
  }

  public async findServicePoint(
    facilityId: string,
    servicePointId: string,
  ): Promise<ClinicalServicePointContextRecord | null> {
    const record = await ServicePointModel.findOne({
      _id: toObjectId(servicePointId, 'servicePointId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId departmentId clinicId code name servicePointType defaultProviderId status',
      )
      .lean<{
        _id: { toHexString(): string };
        facilityId: { toHexString(): string };
        departmentId: { toHexString(): string };
        clinicId: { toHexString(): string } | null;
        code: string;
        name: string;
        servicePointType: string;
        defaultProviderId: { toHexString(): string } | null;
        status: 'ACTIVE' | 'INACTIVE';
      }>()
      .exec();

    return record === null
      ? null
      : {
          id: record._id.toHexString(),
          facilityId: record.facilityId.toHexString(),
          departmentId: record.departmentId.toHexString(),
          clinicId: idText(record.clinicId),
          code: record.code,
          name: record.name,
          servicePointType: record.servicePointType,
          defaultProviderId: idText(record.defaultProviderId),
          status: record.status,
        };
  }

  public async findProvider(
    facilityId: string,
    providerId: string,
  ): Promise<ClinicalProviderContextRecord | null> {
    const record = await StaffModel.findOne({
      _id: toObjectId(providerId, 'providerId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId departmentId employeeNumber displayName designation professionalType employmentStatus isClinical isActive',
      )
      .lean<{
        _id: { toHexString(): string };
        facilityId: { toHexString(): string };
        departmentId: { toHexString(): string } | null;
        employeeNumber: string;
        displayName: string;
        designation: string | null;
        professionalType: string | null;
        employmentStatus: ClinicalProviderContextRecord['employmentStatus'];
        isClinical: boolean;
        isActive: boolean;
      }>()
      .exec();

    return record === null
      ? null
      : {
          id: record._id.toHexString(),
          facilityId: record.facilityId.toHexString(),
          departmentId: idText(record.departmentId),
          employeeNumber: record.employeeNumber,
          displayName: record.displayName,
          designation: record.designation,
          professionalType: record.professionalType,
          employmentStatus: record.employmentStatus,
          isClinical: record.isClinical,
          isActive: record.isActive,
        };
  }

  public async findRegistration(
    facilityId: string,
    registrationId: string,
  ): Promise<ClinicalRegistrationContextRecord | null> {
    const record = await RegistrationModel.findOne({
      _id: toObjectId(registrationId, 'registrationId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId patientId requestedPatientId status serviceDate departmentId clinicId servicePointId assignedProviderId emergencyCaseId referralId',
      )
      .lean<{
        _id: { toHexString(): string };
        facilityId: { toHexString(): string };
        patientId: { toHexString(): string };
        requestedPatientId: { toHexString(): string };
        status: RegistrationStatus;
        serviceDate: string;
        departmentId: { toHexString(): string };
        clinicId: { toHexString(): string } | null;
        servicePointId: { toHexString(): string } | null;
        assignedProviderId: { toHexString(): string } | null;
        emergencyCaseId: { toHexString(): string } | null;
        referralId: { toHexString(): string } | null;
      }>()
      .exec();

    return record === null
      ? null
      : {
          id: record._id.toHexString(),
          facilityId: record.facilityId.toHexString(),
          patientId: record.patientId.toHexString(),
          requestedPatientId: record.requestedPatientId.toHexString(),
          status: record.status,
          serviceDate: record.serviceDate,
          departmentId: record.departmentId.toHexString(),
          clinicId: idText(record.clinicId),
          servicePointId: idText(record.servicePointId),
          assignedProviderId: idText(record.assignedProviderId),
          emergencyCaseId: idText(record.emergencyCaseId),
          referralId: idText(record.referralId),
        };
  }

  public async findOpdVisit(
    facilityId: string,
    opdVisitId: string,
  ): Promise<ClinicalOpdVisitContextRecord | null> {
    const record = await OpdVisitModel.findOne({
      _id: toObjectId(opdVisitId, 'opdVisitId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId registrationId patientId requestedPatientId serviceDate status departmentId clinicId servicePointId assignedProviderId assignedCounterId currentQueueTokenId',
      )
      .lean<{
        _id: { toHexString(): string };
        facilityId: { toHexString(): string };
        registrationId: { toHexString(): string };
        patientId: { toHexString(): string };
        requestedPatientId: { toHexString(): string };
        serviceDate: string;
        status: OpdVisitStatus;
        departmentId: { toHexString(): string };
        clinicId: { toHexString(): string } | null;
        servicePointId: { toHexString(): string } | null;
        assignedProviderId: { toHexString(): string } | null;
        assignedCounterId: { toHexString(): string } | null;
        currentQueueTokenId: { toHexString(): string } | null;
      }>()
      .exec();

    return record === null
      ? null
      : {
          id: record._id.toHexString(),
          facilityId: record.facilityId.toHexString(),
          registrationId: record.registrationId.toHexString(),
          patientId: record.patientId.toHexString(),
          requestedPatientId: record.requestedPatientId.toHexString(),
          serviceDate: record.serviceDate,
          status: record.status,
          departmentId: record.departmentId.toHexString(),
          clinicId: idText(record.clinicId),
          servicePointId: idText(record.servicePointId),
          assignedProviderId: idText(record.assignedProviderId),
          assignedCounterId: idText(record.assignedCounterId),
          currentQueueTokenId: idText(record.currentQueueTokenId),
        };
  }

  public async findQueueToken(
    facilityId: string,
    queueTokenId: string,
  ): Promise<ClinicalQueueContextRecord | null> {
    const record = await QueueTokenModel.findOne({
      _id: toObjectId(queueTokenId, 'queueTokenId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId registrationId opdVisitId patientId queueDefinitionId serviceDate status assignedProviderId assignedCounterId queuedAt calledAt servingAt',
      )
      .lean<{
        _id: { toHexString(): string };
        facilityId: { toHexString(): string };
        registrationId: { toHexString(): string };
        opdVisitId: { toHexString(): string };
        patientId: { toHexString(): string };
        queueDefinitionId: { toHexString(): string };
        serviceDate: string;
        status: QueueEntryStatus;
        assignedProviderId: { toHexString(): string } | null;
        assignedCounterId: { toHexString(): string } | null;
        queuedAt: Date;
        calledAt: Date | null;
        servingAt: Date | null;
      }>()
      .exec();

    return record === null
      ? null
      : {
          id: record._id.toHexString(),
          facilityId: record.facilityId.toHexString(),
          registrationId: record.registrationId.toHexString(),
          opdVisitId: record.opdVisitId.toHexString(),
          patientId: record.patientId.toHexString(),
          queueDefinitionId: record.queueDefinitionId.toHexString(),
          serviceDate: record.serviceDate,
          status: record.status,
          assignedProviderId: idText(record.assignedProviderId),
          assignedCounterId: idText(record.assignedCounterId),
          queuedAt: record.queuedAt,
          calledAt: record.calledAt,
          servingAt: record.servingAt,
        };
  }

  public async findActorIdentity(
    userId: string,
  ): Promise<ClinicalActorIdentityRecord | null> {
    const record = await UserModel.findById(
      toObjectId(userId, 'userId'),
    )
      .select('_id facilityId staffId status')
      .lean<{
        _id: { toHexString(): string };
        facilityId: { toHexString(): string } | null;
        staffId: { toHexString(): string } | null;
        status: ClinicalActorIdentityRecord['status'];
      }>()
      .exec();

    return record === null
      ? null
      : {
          userId: record._id.toHexString(),
          facilityId: idText(record.facilityId),
          staffId: idText(record.staffId),
          status: record.status,
        };
  }
}
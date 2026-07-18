import type {
  Types,
} from 'mongoose';

import {
  DepartmentModel,
  FacilityModel,
  OpdClinicModel,
  QueueDefinitionModel,
  ServiceCounterModel,
  ServicePointModel,
  StaffModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  OpdClinicRecord,
  QueueDefinitionRecord,
  ServiceCounterRecord,
  ServicePointRecord,
} from '../registration-queue.types.js';

export interface RegistrationFacilityContextRecord {
  _id: Types.ObjectId;
  code: string;
  name: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  allowsAuthentication: boolean;
}

export interface RegistrationDepartmentContextRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  code: string;
  name: string;
  isClinical: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface RegistrationProviderContextRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  departmentId: Types.ObjectId | null;
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

const FACILITY_CONTEXT_SELECT = [
  '_id',
  'code',
  'name',
  'timezone',
  'status',
  'allowsAuthentication',
].join(' ');

const DEPARTMENT_CONTEXT_SELECT = [
  '_id',
  'facilityId',
  'code',
  'name',
  'isClinical',
  'status',
].join(' ');

const CLINIC_CONTEXT_SELECT = [
  '_id',
  'facilityId',
  'departmentId',
  'code',
  'name',
  'description',
  'location',
  'defaultProviderId',
  'status',
  'deactivatedAt',
  'deactivatedBy',
  'deactivationReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const SERVICE_POINT_CONTEXT_SELECT = [
  '_id',
  'facilityId',
  'departmentId',
  'clinicId',
  'code',
  'name',
  'servicePointType',
  'location',
  'defaultProviderId',
  'allowsWalkIn',
  'allowsAppointment',
  'allowsReferral',
  'allowsEmergency',
  'status',
  'deactivatedAt',
  'deactivatedBy',
  'deactivationReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const PROVIDER_CONTEXT_SELECT = [
  '_id',
  'facilityId',
  'departmentId',
  'employeeNumber',
  'displayName',
  'designation',
  'professionalType',
  'employmentStatus',
  'isClinical',
  'isActive',
].join(' ');

const QUEUE_DEFINITION_CONTEXT_SELECT = [
  '_id',
  'facilityId',
  'departmentId',
  'clinicId',
  'servicePointId',
  'providerId',
  'code',
  'name',
  'displayLabel',
  'tokenPrefix',
  'resetPolicy',
  'timezone',
  'estimatedServiceMinutes',
  'maximumRecallCount',
  'allowPriority',
  'allowEmergencyOverride',
  'publicDisplayEnabled',
  'publicDisplayMode',
  'status',
  'deactivatedAt',
  'deactivatedBy',
  'deactivationReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const SERVICE_COUNTER_CONTEXT_SELECT = [
  '_id',
  'facilityId',
  'departmentId',
  'clinicId',
  'servicePointId',
  'code',
  'name',
  'counterType',
  'queueDefinitionIds',
  'status',
  'activeUserId',
  'activeProviderId',
  'openedAt',
  'closedAt',
  'statusReason',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

export class RegistrationContextRepository {
  public async findFacility(
    facilityId: string,
  ): Promise<RegistrationFacilityContextRecord | null> {
    return FacilityModel.findById(
      toObjectId(
        facilityId,
        'facilityId',
      ),
    )
      .select(
        FACILITY_CONTEXT_SELECT,
      )
      .lean<RegistrationFacilityContextRecord>()
      .exec();
  }

  public async findDepartment(
    facilityId: string,
    departmentId: string,
  ): Promise<RegistrationDepartmentContextRecord | null> {
    return DepartmentModel.findOne({
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
        DEPARTMENT_CONTEXT_SELECT,
      )
      .lean<RegistrationDepartmentContextRecord>()
      .exec();
  }

  public async findClinic(
    facilityId: string,
    clinicId: string,
  ): Promise<OpdClinicRecord | null> {
    return OpdClinicModel.findOne({
      _id:
        toObjectId(
          clinicId,
          'clinicId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        CLINIC_CONTEXT_SELECT,
      )
      .lean<OpdClinicRecord>()
      .exec();
  }

  public async findServicePoint(
    facilityId: string,
    servicePointId: string,
  ): Promise<ServicePointRecord | null> {
    return ServicePointModel.findOne({
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
        SERVICE_POINT_CONTEXT_SELECT,
      )
      .lean<ServicePointRecord>()
      .exec();
  }

  public async findProvider(
    facilityId: string,
    providerId: string,
  ): Promise<RegistrationProviderContextRecord | null> {
    return StaffModel.findOne({
      _id:
        toObjectId(
          providerId,
          'providerId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        PROVIDER_CONTEXT_SELECT,
      )
      .lean<RegistrationProviderContextRecord>()
      .exec();
  }

  public async findQueueDefinition(
    facilityId: string,
    queueDefinitionId: string,
  ): Promise<QueueDefinitionRecord | null> {
    return QueueDefinitionModel.findOne({
      _id:
        toObjectId(
          queueDefinitionId,
          'queueDefinitionId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        QUEUE_DEFINITION_CONTEXT_SELECT,
      )
      .lean<QueueDefinitionRecord>()
      .exec();
  }

  public async findCounter(
    facilityId: string,
    counterId: string,
  ): Promise<ServiceCounterRecord | null> {
    return ServiceCounterModel.findOne({
      _id:
        toObjectId(
          counterId,
          'counterId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    })
      .select(
        SERVICE_COUNTER_CONTEXT_SELECT,
      )
      .lean<ServiceCounterRecord>()
      .exec();
  }
}
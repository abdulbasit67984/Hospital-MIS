import type {
  Types,
} from 'mongoose';

import type {
  DepartmentStatus,
  DepartmentType,
  FacilityStatus,
  FacilityType,
  SettingCategory,
  SettingChangeSource,
  SettingChangeType,
  SettingDataType,
  SettingScope,
} from './facility.constants.js';

export type ObjectIdString = string;

export interface FacilityActorContext {
  userId: ObjectIdString;
  facilityId: ObjectIdString | null;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface FacilityIdentifier {
  type: string;
  value: string;
  normalizedValue: string;
  issuingAuthority: string | null;
  isPrimary: boolean;
}

export interface FacilityAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  countryCode: string;
}

export interface FacilityContact {
  primaryPhone: string | null;
  secondaryPhone: string | null;
  email: string | null;
  website: string | null;
  emergencyPhone: string | null;
}

export interface FacilityRecord {
  _id: Types.ObjectId;
  code: string;
  name: string;
  legalName: string | null;
  facilityType: FacilityType;
  parentFacilityId: Types.ObjectId | null;
  identifiers: FacilityIdentifier[];
  timezone: string;
  currency: string;
  locale: string;
  supportedLocales: string[];
  address: FacilityAddress;
  contact: FacilityContact;
  status: FacilityStatus;
  allowsAuthentication: boolean;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FacilityDto {
  id: ObjectIdString;
  code: string;
  name: string;
  legalName: string | null;
  facilityType: FacilityType;
  parentFacilityId: ObjectIdString | null;
  identifiers: FacilityIdentifier[];
  timezone: string;
  currency: string;
  locale: string;
  supportedLocales: string[];
  address: FacilityAddress;
  contact: FacilityContact;
  status: FacilityStatus;
  allowsAuthentication: boolean;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentContact {
  phone: string | null;
  extension: string | null;
  email: string | null;
}

export interface DepartmentRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  parentDepartmentId: Types.ObjectId | null;
  managerStaffId: Types.ObjectId | null;
  code: string;
  name: string;
  description: string | null;
  departmentType: DepartmentType;
  isClinical: boolean;
  location: string | null;
  costCenterCode: string | null;
  contact: DepartmentContact;
  status: DepartmentStatus;
  deactivatedAt: Date | null;
  deactivatedBy: Types.ObjectId | null;
  deactivationReason: string | null;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartmentDto {
  id: ObjectIdString;
  facilityId: ObjectIdString;
  parentDepartmentId: ObjectIdString | null;
  managerStaffId: ObjectIdString | null;
  code: string;
  name: string;
  description: string | null;
  departmentType: DepartmentType;
  isClinical: boolean;
  location: string | null;
  costCenterCode: string | null;
  contact: DepartmentContact;
  status: DepartmentStatus;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SettingLocalizedLabel {
  locale: string;
  label: string;
  description: string | null;
}

export interface SettingValidationRules {
  required: boolean;
  minLength: number | null;
  maxLength: number | null;
  pattern: string | null;
  minimum: string | null;
  maximum: string | null;
  allowedValues: unknown[];
  jsonSchema: Record<string, unknown> | null;
}

export interface SettingDefinitionRecord {
  _id: Types.ObjectId;
  key: string;
  category: SettingCategory;
  dataType: SettingDataType;
  allowedScopes: SettingScope[];
  defaultValue: unknown;
  labels: SettingLocalizedLabel[];
  validation: SettingValidationRules;
  isSensitive: boolean;
  isMutable: boolean;
  isActive: boolean;
  cacheTtlSeconds: number;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettingDefinitionDto {
  id: ObjectIdString;
  key: string;
  category: SettingCategory;
  dataType: SettingDataType;
  allowedScopes: SettingScope[];
  defaultValue: unknown;
  labels: SettingLocalizedLabel[];
  validation: SettingValidationRules;
  isSensitive: boolean;
  isMutable: boolean;
  isActive: boolean;
  cacheTtlSeconds: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EncryptedSettingValue {
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
}

export interface SystemSettingRecord {
  _id: Types.ObjectId;
  definitionId: Types.ObjectId;
  key: string;
  scope: SettingScope;
  facilityId: Types.ObjectId | null;
  value: unknown;
  encryptedValue: EncryptedSettingValue | null;
  valueHash: string | null;
  isSensitive: boolean;
  revision: number;
  isActive: boolean;
  schemaVersion: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SystemSettingDto {
  id: ObjectIdString;
  key: string;
  scope: SettingScope;
  facilityId: ObjectIdString | null;
  value: unknown;
  isSensitive: boolean;
  isConfigured: boolean;
  revision: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SystemSettingVersionRecord {
  _id: Types.ObjectId;
  settingId: Types.ObjectId;
  definitionId: Types.ObjectId;
  key: string;
  scope: SettingScope;
  facilityId: Types.ObjectId | null;
  revision: number;
  changeType: SettingChangeType;
  changeSource: SettingChangeSource;
  value: unknown;
  encryptedValue: EncryptedSettingValue | null;
  valueHash: string | null;
  isSensitive: boolean;
  isActive: boolean;
  changedBy: Types.ObjectId | null;
  changeReason: string;
  correlationId: string | null;
  changedAt: Date;
  schemaVersion: number;
  createdAt: Date;
}

export interface SystemSettingVersionDto {
  id: ObjectIdString;
  settingId: ObjectIdString;
  key: string;
  scope: SettingScope;
  facilityId: ObjectIdString | null;
  revision: number;
  changeType: SettingChangeType;
  changeSource: SettingChangeSource;
  value: unknown;
  isSensitive: boolean;
  isConfigured: boolean;
  isActive: boolean;
  changedBy: ObjectIdString | null;
  changeReason: string;
  correlationId: string | null;
  changedAt: string;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface FacilityListQuery {
  search?: string;
  parentFacilityId?: ObjectIdString | null;
  facilityType?: FacilityType;
  status?: FacilityStatus;
  allowsAuthentication?: boolean;
  page: number;
  pageSize: number;
  sortBy:
    | 'code'
    | 'name'
    | 'facilityType'
    | 'status'
    | 'createdAt'
    | 'updatedAt';
  sortDirection: 'asc' | 'desc';
}

export interface DepartmentListQuery {
  facilityId: ObjectIdString;
  search?: string;
  parentDepartmentId?: ObjectIdString | null;
  departmentType?: DepartmentType;
  status?: DepartmentStatus;
  isClinical?: boolean;
  page: number;
  pageSize: number;
  sortBy:
    | 'code'
    | 'name'
    | 'departmentType'
    | 'status'
    | 'createdAt'
    | 'updatedAt';
  sortDirection: 'asc' | 'desc';
}

export interface SettingDefinitionListQuery {
  search?: string;
  category?: SettingCategory;
  dataType?: SettingDataType;
  scope?: SettingScope;
  activeOnly: boolean;
  page: number;
  pageSize: number;
  sortBy:
    | 'key'
    | 'category'
    | 'dataType'
    | 'createdAt'
    | 'updatedAt';
  sortDirection: 'asc' | 'desc';
}

export interface SystemSettingListQuery {
  facilityId?: ObjectIdString | null;
  scope?: SettingScope;
  category?: SettingCategory;
  activeOnly: boolean;
  search?: string;
  page: number;
  pageSize: number;
  sortBy:
    | 'key'
    | 'scope'
    | 'revision'
    | 'createdAt'
    | 'updatedAt';
  sortDirection: 'asc' | 'desc';
}

export interface CreateFacilityInput {
  code: string;
  name: string;
  legalName?: string | null;
  facilityType: FacilityType;
  parentFacilityId?: ObjectIdString | null;
  identifiers?: Array<{
    type: string;
    value: string;
    issuingAuthority?: string | null;
    isPrimary?: boolean;
  }>;
  timezone: string;
  currency: string;
  locale: string;
  supportedLocales: string[];
  address: FacilityAddress;
  contact: FacilityContact;
  allowsAuthentication: boolean;
}

export interface UpdateFacilityInput {
  expectedVersion: number;
  name?: string;
  legalName?: string | null;
  parentFacilityId?: ObjectIdString | null;
  identifiers?: Array<{
    type: string;
    value: string;
    issuingAuthority?: string | null;
    isPrimary?: boolean;
  }>;
  timezone?: string;
  currency?: string;
  locale?: string;
  supportedLocales?: string[];
  address?: FacilityAddress;
  contact?: FacilityContact;
  allowsAuthentication?: boolean;
}

export interface CreateDepartmentInput {
  facilityId: ObjectIdString;
  parentDepartmentId?: ObjectIdString | null;
  managerStaffId?: ObjectIdString | null;
  code: string;
  name: string;
  description?: string | null;
  departmentType: DepartmentType;
  isClinical: boolean;
  location?: string | null;
  costCenterCode?: string | null;
  contact: DepartmentContact;
}

export interface UpdateDepartmentInput {
  expectedVersion: number;
  parentDepartmentId?: ObjectIdString | null;
  managerStaffId?: ObjectIdString | null;
  name?: string;
  description?: string | null;
  departmentType?: DepartmentType;
  isClinical?: boolean;
  location?: string | null;
  costCenterCode?: string | null;
  contact?: DepartmentContact;
}

export interface CreateSettingDefinitionInput {
  key: string;
  category: SettingCategory;
  dataType: SettingDataType;
  allowedScopes: SettingScope[];
  defaultValue?: unknown;
  labels: SettingLocalizedLabel[];
  validation: SettingValidationRules;
  isSensitive: boolean;
  isMutable: boolean;
  isActive: boolean;
  cacheTtlSeconds: number;
}

export interface UpdateSettingDefinitionInput {
  expectedVersion: number;
  category?: SettingCategory;
  allowedScopes?: SettingScope[];
  defaultValue?: unknown;
  labels?: SettingLocalizedLabel[];
  validation?: SettingValidationRules;
  isMutable?: boolean;
  isActive?: boolean;
  cacheTtlSeconds?: number;
}

export interface CreateSystemSettingPersistenceInput {
  definitionId: ObjectIdString;
  key: string;
  scope: SettingScope;
  facilityId: ObjectIdString | null;
  value: unknown;
  encryptedValue: EncryptedSettingValue | null;
  valueHash: string | null;
  isSensitive: boolean;
  isActive: boolean;
  actorUserId: ObjectIdString;
}

export interface UpdateSystemSettingPersistenceInput {
  expectedVersion: number;
  expectedRevision: number;
  value: unknown;
  encryptedValue: EncryptedSettingValue | null;
  valueHash: string | null;
  isActive: boolean;
  actorUserId: ObjectIdString;
}

export interface CreateSystemSettingVersionInput {
  settingId: ObjectIdString;
  definitionId: ObjectIdString;
  key: string;
  scope: SettingScope;
  facilityId: ObjectIdString | null;
  revision: number;
  changeType: SettingChangeType;
  changeSource: SettingChangeSource;
  value: unknown;
  encryptedValue: EncryptedSettingValue | null;
  valueHash: string | null;
  isSensitive: boolean;
  isActive: boolean;
  changedBy: ObjectIdString | null;
  changeReason: string;
  correlationId: string | null;
  changedAt: Date;
}
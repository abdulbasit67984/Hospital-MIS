import type { Types } from 'mongoose';

import type {
  RoleScope,
  StaffEmploymentStatus,
  UserStatus,
} from './identity.constants.js';

export type ObjectIdString = string;
export type SortDirection = 'asc' | 'desc';

export interface IdentityActorContext {
  userId: ObjectIdString;
  facilityId?: ObjectIdString;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface IdentityPageInput {
  page: number;
  pageSize: number;
}

export interface IdentityPageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PermissionRecord {
  _id: Types.ObjectId;
  code: string;
  name: string;
  module: string;
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleRecord {
  _id: Types.ObjectId;
  facilityId?: Types.ObjectId | null;
  code: string;
  name: string;
  description?: string | null;
  scope: RoleScope;
  isSystem: boolean;
  isActive: boolean;
  version: number;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RolePermissionRecord {
  _id: Types.ObjectId;
  roleId: Types.ObjectId;
  permissionId: Types.ObjectId;
  grantedBy: Types.ObjectId;
  grantedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffRecord {
  _id: Types.ObjectId;
  facilityId: Types.ObjectId;
  departmentId?: Types.ObjectId | null;
  employeeNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  displayName: string;
  cnic?: string | null;
  phone?: string | null;
  email?: string | null;
  designation?: string | null;
  professionalType?: string | null;
  professionalRegistrationNumber?: string | null;
  joiningDate?: Date | null;
  employmentStatus: StaffEmploymentStatus;
  isClinical: boolean;
  isActive: boolean;
  version: number;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRecord {
  _id: Types.ObjectId;
  staffId?: Types.ObjectId | null;
  username: string;
  normalizedUsername: string;
  email?: string | null;
  normalizedEmail?: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  failedLoginCount: number;

  /**
   * Backward-compatible API projection derived from failedLoginCount.
   * This property is not persisted.
   */
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  lastLoginAt?: Date | null;
  passwordChangedAt?: Date | null;
  version: number;
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCredentialRecord extends UserRecord {
  passwordHash: string;
}

export interface UserRoleRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  roleId: Types.ObjectId;
  facilityId?: Types.ObjectId | null;
  assignedBy: Types.ObjectId;
  assignedAt: Date;
  expiresAt?: Date | null;
  isActive: boolean;
  revokedAt?: Date | null;
  revokedBy?: Types.ObjectId | null;
  revocationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionDto {
  id: ObjectIdString;
  code: string;
  name: string;
  module: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDto {
  id: ObjectIdString;
  facilityId: ObjectIdString | null;
  code: string;
  name: string;
  description: string | null;
  scope: RoleScope;
  isSystem: boolean;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffDto {
  id: ObjectIdString;
  facilityId: ObjectIdString;
  departmentId: ObjectIdString | null;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
  cnic: string | null;
  phone: string | null;
  email: string | null;
  designation: string | null;
  professionalType: string | null;
  professionalRegistrationNumber: string | null;
  joiningDate: string | null;
  employmentStatus: StaffEmploymentStatus;
  isClinical: boolean;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserDto {
  id: ObjectIdString;
  staffId: ObjectIdString | null;
  username: string;
  email: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserRoleDto {
  id: ObjectIdString;
  userId: ObjectIdString;
  roleId: ObjectIdString;
  facilityId: ObjectIdString | null;
  assignedBy: ObjectIdString;
  assignedAt: string;
  expiresAt: string | null;
  isActive: boolean;
  revokedAt: string | null;
  revokedBy: ObjectIdString | null;
  revocationReason: string | null;
}

export interface PermissionListQuery extends IdentityPageInput {
  search?: string;
  module?: string;
  activeOnly?: boolean;
  sortBy?: string;
  sortDirection?: SortDirection;
}

export interface RoleListQuery extends IdentityPageInput {
  search?: string;
  facilityId?: ObjectIdString;
  scope?: RoleScope;
  activeOnly?: boolean;
  sortBy?: string;
  sortDirection?: SortDirection;
}

export interface StaffListQuery extends IdentityPageInput {
  search?: string;
  facilityId: ObjectIdString;
  departmentId?: ObjectIdString;
  employmentStatus?: StaffEmploymentStatus;
  isClinical?: boolean;
  activeOnly?: boolean;
  sortBy?: string;
  sortDirection?: SortDirection;
}

export interface UserListQuery extends IdentityPageInput {
  search?: string;
  staffId?: ObjectIdString;
  status?: UserStatus;
  facilityId?: ObjectIdString;
  sortBy?: string;
  sortDirection?: SortDirection;
}

export interface CreateRoleInput {
  facilityId?: ObjectIdString | null;
  code: string;
  name: string;
  description?: string | null;
  scope: RoleScope;
  permissionIds?: ObjectIdString[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  expectedVersion: number;
}

export interface ReplaceRolePermissionsInput {
  permissionIds: ObjectIdString[];
  expectedRoleVersion: number;
}

export interface CreateStaffInput {
  facilityId: ObjectIdString;
  departmentId?: ObjectIdString | null;
  employeeNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  cnic?: string | null;
  phone?: string | null;
  email?: string | null;
  designation?: string | null;
  professionalType?: string | null;
  professionalRegistrationNumber?: string | null;
  joiningDate?: string | null;
  employmentStatus?: StaffEmploymentStatus;
  isClinical?: boolean;
}

export interface UpdateStaffInput {
  departmentId?: ObjectIdString | null;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  cnic?: string | null;
  phone?: string | null;
  email?: string | null;
  designation?: string | null;
  professionalType?: string | null;
  professionalRegistrationNumber?: string | null;
  joiningDate?: string | null;
  employmentStatus?: StaffEmploymentStatus;
  isClinical?: boolean;
  isActive?: boolean;
  expectedVersion: number;
}

export interface CreateUserInput {
  staffId?: ObjectIdString | null;
  username: string;
  email?: string | null;
  password: string;
  mustChangePassword?: boolean;
  status?: UserStatus;
  roleAssignments?: Array<{
    roleId: ObjectIdString;
    facilityId?: ObjectIdString | null;
    expiresAt?: string | null;
  }>;
}

export interface UpdateUserInput {
  email?: string | null;
  status?: UserStatus;
  mustChangePassword?: boolean;
  expectedVersion: number;
}

export interface ReplaceUserRolesInput {
  assignments: Array<{
    roleId: ObjectIdString;
    facilityId?: ObjectIdString | null;
    expiresAt?: string | null;
  }>;
  reason: string;
}

export interface CreateUserPersistenceInput {
  staffId?: Types.ObjectId | null;
  username: string;
  normalizedUsername: string;
  email?: string | null;
  normalizedEmail?: string | null;
  passwordHash: string;
  status: UserStatus;
  mustChangePassword: boolean;
  createdBy: Types.ObjectId;
}

export interface CreateRolePersistenceInput {
  facilityId?: Types.ObjectId | null;
  code: string;
  name: string;
  description?: string | null;
  scope: RoleScope;
  isSystem: boolean;
  isActive: boolean;
  createdBy: Types.ObjectId;
}

export interface CreateStaffPersistenceInput {
  facilityId: Types.ObjectId;
  departmentId?: Types.ObjectId | null;
  employeeNumber: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  displayName: string;
  cnic?: string | null;
  phone?: string | null;
  email?: string | null;
  designation?: string | null;
  professionalType?: string | null;
  professionalRegistrationNumber?: string | null;
  joiningDate?: Date | null;
  employmentStatus: StaffEmploymentStatus;
  isClinical: boolean;
  createdBy: Types.ObjectId;
}
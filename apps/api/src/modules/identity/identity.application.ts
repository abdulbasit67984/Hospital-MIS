import {
  randomUUID,
} from 'node:crypto';

import type {
  IdentityAuditPort,
  IdentityClockPort,
  IdentityIdGeneratorPort,
  IdentityOutboxPort,
  IdentityPasswordHasherPort,
  IdentitySessionRevocationPort,
  IdentityTransactionManagerPort,
} from './identity.ports.js';

import {
  createIdentityRecordPolicies,
  type IdentityRecordPolicies,
} from './identity.policy.js';

import {
  UserRoleAssignmentPolicy,
} from './policies/user-role-assignment.policy.js';

import {
  PermissionRepository,
} from './repositories/permission.repository.js';

import {
  RolePermissionRepository,
} from './repositories/role-permission.repository.js';

import {
  RoleRepository,
} from './repositories/role.repository.js';

import {
  StaffRepository,
} from './repositories/staff.repository.js';

import {
  UserRoleRepository,
} from './repositories/user-role.repository.js';

import {
  UserRepository,
} from './repositories/user.repository.js';

import {
  PermissionService,
} from './services/permission.service.js';

import {
  RoleService,
} from './services/role.service.js';

import {
  StaffService,
} from './services/staff.service.js';

import {
  UserRoleService,
} from './services/user-role.service.js';

import {
  UserService,
} from './services/user.service.js';

import {
  CreateRoleWorkflow,
} from './workflows/create-role.workflow.js';

import {
  CreateStaffWorkflow,
} from './workflows/create-staff.workflow.js';

import {
  CreateUserWorkflow,
} from './workflows/create-user.workflow.js';

import {
  ReplaceRolePermissionsWorkflow,
} from './workflows/replace-role-permissions.workflow.js';

import {
  ReplaceUserRolesWorkflow,
} from './workflows/replace-user-roles.workflow.js';

import {
  ResetUserPasswordWorkflow,
} from './workflows/reset-user-password.workflow.js';

import {
  RevokeUserSessionsWorkflow,
} from './workflows/revoke-user-sessions.workflow.js';

import {
  UpdateRoleWorkflow,
} from './workflows/update-role.workflow.js';

import {
  UpdateStaffWorkflow,
} from './workflows/update-staff.workflow.js';

import {
  UpdateUserWorkflow,
} from './workflows/update-user.workflow.js';

export interface CreateIdentityApplicationOptions {
  transactionManager:
    IdentityTransactionManagerPort;

  audit:
    IdentityAuditPort;

  outbox:
    IdentityOutboxPort;

  passwordHasher:
    IdentityPasswordHasherPort;

  sessions:
    IdentitySessionRevocationPort;

  clock?:
    IdentityClockPort;

  idGenerator?:
    IdentityIdGeneratorPort;
}

export interface IdentityApplication {
  permissionService:
    PermissionService;

  roleService:
    RoleService;

  staffService:
    StaffService;

  userService:
    UserService;

  userRoleService:
    UserRoleService;

  policies:
    IdentityRecordPolicies;

  repositories: {
    permissionRepository:
      PermissionRepository;

    roleRepository:
      RoleRepository;

    rolePermissionRepository:
      RolePermissionRepository;

    staffRepository:
      StaffRepository;

    userRepository:
      UserRepository;

    userRoleRepository:
      UserRoleRepository;
  };
}

const systemClock:
  IdentityClockPort = {
    now():
      Date {
      return new Date();
    },
  };

const uuidGenerator:
  IdentityIdGeneratorPort = {
    generate():
      string {
      return randomUUID();
    },
  };

export function createIdentityApplication(
  options:
    CreateIdentityApplicationOptions,
): IdentityApplication {
  const clock =
    options.clock ??
    systemClock;

  const idGenerator =
    options.idGenerator ??
    uuidGenerator;

  const permissionRepository =
    new PermissionRepository();

  const roleRepository =
    new RoleRepository();

  const rolePermissionRepository =
    new RolePermissionRepository();

  const staffRepository =
    new StaffRepository();

  const userRepository =
    new UserRepository();

  const userRoleRepository =
    new UserRoleRepository();

  const mutationDependencies = {
    transactionManager:
      options.transactionManager,

    audit:
      options.audit,

    outbox:
      options.outbox,

    clock,

    idGenerator,
  };

  const userMutationDependencies = {
    ...mutationDependencies,

    passwordHasher:
      options.passwordHasher,

    sessions:
      options.sessions,
  };

  const userRoleAssignmentPolicy =
    new UserRoleAssignmentPolicy(
      roleRepository,
      clock,
    );

  const createRoleWorkflow =
    new CreateRoleWorkflow(
      roleRepository,
      permissionRepository,
      rolePermissionRepository,
      mutationDependencies,
    );

  const updateRoleWorkflow =
    new UpdateRoleWorkflow(
      roleRepository,
      mutationDependencies,
    );

  const replaceRolePermissionsWorkflow =
    new ReplaceRolePermissionsWorkflow(
      roleRepository,
      permissionRepository,
      rolePermissionRepository,
      mutationDependencies,
    );

  const createStaffWorkflow =
    new CreateStaffWorkflow(
      staffRepository,
      mutationDependencies,
    );

  const updateStaffWorkflow =
    new UpdateStaffWorkflow(
      staffRepository,
      mutationDependencies,
    );

  const createUserWorkflow =
    new CreateUserWorkflow(
      userRepository,
      staffRepository,
      userRoleRepository,
      userRoleAssignmentPolicy,
      userMutationDependencies,
    );

  const updateUserWorkflow =
    new UpdateUserWorkflow(
      userRepository,
      userMutationDependencies,
    );

  const resetUserPasswordWorkflow =
    new ResetUserPasswordWorkflow(
      userRepository,
      userMutationDependencies,
    );

  const revokeUserSessionsWorkflow =
    new RevokeUserSessionsWorkflow(
      userRepository,
      userMutationDependencies,
    );

  const replaceUserRolesWorkflow =
    new ReplaceUserRolesWorkflow(
      userRepository,
      userRoleRepository,
      userRoleAssignmentPolicy,
      mutationDependencies,
    );

  const permissionService =
    new PermissionService(
      permissionRepository,
    );

  const roleService =
    new RoleService(
      roleRepository,
      rolePermissionRepository,
      createRoleWorkflow,
      updateRoleWorkflow,
      replaceRolePermissionsWorkflow,
    );

  const staffService =
    new StaffService(
      staffRepository,
      createStaffWorkflow,
      updateStaffWorkflow,
    );

  const userService =
    new UserService(
      userRepository,
      userRoleRepository,
      createUserWorkflow,
      updateUserWorkflow,
      resetUserPasswordWorkflow,
      revokeUserSessionsWorkflow,
      replaceUserRolesWorkflow,
    );

  const userRoleService =
    new UserRoleService(
      userRepository,
      userRoleRepository,
    );

  return {
    permissionService,
    roleService,
    staffService,
    userService,
    userRoleService,

    policies:
      createIdentityRecordPolicies(),

    repositories: {
      permissionRepository,
      roleRepository,
      rolePermissionRepository,
      staffRepository,
      userRepository,
      userRoleRepository,
    },
  };
}
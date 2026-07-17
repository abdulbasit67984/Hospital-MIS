import {
  IANAZone,
} from 'luxon';

import {
  StaffModel,
} from '@hospital-mis/database';

import {
  BadRequestError,
  ConflictError,
} from '@hospital-mis/shared';

import {
  DEPARTMENT_STATUS,
  FACILITY_STATUS,
} from './facility.constants.js';

import {
  DepartmentCodeConflictError,
  DepartmentNotFoundError,
  FacilityCodeConflictError,
  FacilityNotFoundError,
  InvalidDepartmentHierarchyError,
  InvalidFacilityHierarchyError,
} from './facility.errors.js';

import {
  normalizeCurrency,
  normalizeDepartmentCode,
  normalizeEmail,
  normalizeFacilityCode,
  normalizeFacilityIdentifiers,
  normalizeOptionalText,
  nullableObjectIdToString,
  toObjectId,
} from './facility.mapper.js';

import type {
  CreateDepartmentInput,
  CreateFacilityInput,
  DepartmentDto,
  DepartmentRecord,
  FacilityActorContext,
  FacilityDto,
  FacilityRecord,
  UpdateDepartmentInput,
  UpdateFacilityInput,
} from './facility.types.js';

import type {
  DepartmentRepository,
} from './repositories/department.repository.js';

import type {
  FacilityRepository,
} from './repositories/facility.repository.js';

interface MongoLikeError {
  code?: unknown;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  cause?: unknown;
}

function asMongoLikeError(
  error: unknown,
): MongoLikeError | null {
  if (
    typeof error !== 'object' ||
    error === null
  ) {
    return null;
  }

  return error as MongoLikeError;
}

function findDuplicateKeyError(
  error: unknown,
  depth = 0,
): MongoLikeError | null {
  if (depth > 5) {
    return null;
  }

  const candidate =
    asMongoLikeError(error);

  if (candidate === null) {
    return null;
  }

  if (candidate.code === 11000) {
    return candidate;
  }

  if (candidate.cause !== undefined) {
    return findDuplicateKeyError(
      candidate.cause,
      depth + 1,
    );
  }

  return null;
}

function canonicalLocale(
  value: string,
): string {
  try {
    return new Intl.Locale(
      value.trim(),
    ).toString();
  } catch {
    throw new BadRequestError(
      `Invalid locale: ${value}`,
    );
  }
}

function canonicalLocales(
  primaryLocale: string,
  values: readonly string[],
): string[] {
  return [
    ...new Set([
      primaryLocale,
      ...values.map(
        canonicalLocale,
      ),
    ]),
  ];
}

function validateTimezone(
  value: string,
): string {
  const timezone =
    value.trim();

  if (
    !IANAZone.isValidZone(
      timezone,
    )
  ) {
    throw new BadRequestError(
      `Invalid IANA timezone: ${value}`,
    );
  }

  return timezone;
}

function validateCurrency(
  value: string,
): string {
  const currency =
    normalizeCurrency(value);

  try {
    new Intl.NumberFormat(
      'en',
      {
        style: 'currency',
        currency,
      },
    ).format(0);
  } catch {
    throw new BadRequestError(
      `Invalid ISO currency code: ${value}`,
    );
  }

  return currency;
}

function normalizeAddress(
  address:
    CreateFacilityInput['address'],
): CreateFacilityInput['address'] {
  return {
    line1:
      normalizeOptionalText(
        address.line1,
      ),

    line2:
      normalizeOptionalText(
        address.line2,
      ),

    city:
      normalizeOptionalText(
        address.city,
      ),

    district:
      normalizeOptionalText(
        address.district,
      ),

    province:
      normalizeOptionalText(
        address.province,
      ),

    postalCode:
      normalizeOptionalText(
        address.postalCode,
      ),

    countryCode:
      address.countryCode
        .trim()
        .toLocaleUpperCase(
          'en-US',
        ),
  };
}

function normalizeFacilityContact(
  contact:
    CreateFacilityInput['contact'],
): CreateFacilityInput['contact'] {
  return {
    primaryPhone:
      normalizeOptionalText(
        contact.primaryPhone,
      ),

    secondaryPhone:
      normalizeOptionalText(
        contact.secondaryPhone,
      ),

    email:
      normalizeEmail(
        contact.email,
      ),

    website:
      normalizeOptionalText(
        contact.website,
      ),

    emergencyPhone:
      normalizeOptionalText(
        contact.emergencyPhone,
      ),
  };
}

function normalizeDepartmentContact(
  contact:
    CreateDepartmentInput['contact'],
): CreateDepartmentInput['contact'] {
  return {
    phone:
      normalizeOptionalText(
        contact.phone,
      ),

    extension:
      normalizeOptionalText(
        contact.extension,
      ),

    email:
      normalizeEmail(
        contact.email,
      ),
  };
}

export function requireActorFacilityId(
  actor: FacilityActorContext,
): string {
  if (actor.facilityId === null) {
    throw new BadRequestError(
      'An authenticated facility context is required for this operation',
    );
  }

  return actor.facilityId;
}

export function normalizeCreateFacilityInput(
  input: CreateFacilityInput,
): CreateFacilityInput {
  const locale =
    canonicalLocale(
      input.locale,
    );

  const supportedLocales =
    canonicalLocales(
      locale,
      input.supportedLocales,
    );

  const identifiers =
    normalizeFacilityIdentifiers(
      input.identifiers,
    );

  const primaryCount =
    identifiers.filter(
      (identifier) =>
        identifier.isPrimary,
    ).length;

  if (primaryCount > 1) {
    throw new BadRequestError(
      'Only one facility identifier may be primary',
    );
  }

  const identityKeys =
    identifiers.map(
      (identifier) =>
        [
          identifier.type,
          identifier.normalizedValue,
        ].join(':'),
    );

  if (
    new Set(identityKeys).size !==
    identityKeys.length
  ) {
    throw new BadRequestError(
      'Duplicate facility identifiers are not permitted',
    );
  }

  return {
    code:
      normalizeFacilityCode(
        input.code,
      ),

    name:
      input.name.trim(),

    legalName:
      normalizeOptionalText(
        input.legalName,
      ),

    facilityType:
      input.facilityType,

    parentFacilityId:
      input.parentFacilityId ??
      null,

    identifiers,

    timezone:
      validateTimezone(
        input.timezone,
      ),

    currency:
      validateCurrency(
        input.currency,
      ),

    locale,

    supportedLocales,

    address:
      normalizeAddress(
        input.address,
      ),

    contact:
      normalizeFacilityContact(
        input.contact,
      ),

    allowsAuthentication:
      input.allowsAuthentication,
  };
}

export function normalizeUpdateFacilityInput(
  input: UpdateFacilityInput,
  current: FacilityRecord,
): UpdateFacilityInput {
  const locale =
    input.locale === undefined
      ? current.locale
      : canonicalLocale(
          input.locale,
        );

  const supportedLocales =
    input.locale === undefined &&
    input.supportedLocales === undefined
      ? undefined
      : canonicalLocales(
          locale,
          input.supportedLocales ??
            current.supportedLocales,
        );

  const identifiers =
    input.identifiers === undefined
      ? undefined
      : normalizeFacilityIdentifiers(
          input.identifiers,
        );

  if (identifiers !== undefined) {
    const primaryCount =
      identifiers.filter(
        (identifier) =>
          identifier.isPrimary,
      ).length;

    if (primaryCount > 1) {
      throw new BadRequestError(
        'Only one facility identifier may be primary',
      );
    }

    const identityKeys =
      identifiers.map(
        (identifier) =>
          [
            identifier.type,
            identifier.normalizedValue,
          ].join(':'),
      );

    if (
      new Set(identityKeys).size !==
      identityKeys.length
    ) {
      throw new BadRequestError(
        'Duplicate facility identifiers are not permitted',
      );
    }
  }

  return {
    expectedVersion:
      input.expectedVersion,

    ...(input.name === undefined
      ? {}
      : {
          name:
            input.name.trim(),
        }),

    ...(input.legalName === undefined
      ? {}
      : {
          legalName:
            normalizeOptionalText(
              input.legalName,
            ),
        }),

    ...(input.parentFacilityId === undefined
      ? {}
      : {
          parentFacilityId:
            input.parentFacilityId,
        }),

    ...(identifiers === undefined
      ? {}
      : {
          identifiers,
        }),

    ...(input.timezone === undefined
      ? {}
      : {
          timezone:
            validateTimezone(
              input.timezone,
            ),
        }),

    ...(input.currency === undefined
      ? {}
      : {
          currency:
            validateCurrency(
              input.currency,
            ),
        }),

    ...(input.locale === undefined
      ? {}
      : {
          locale,
        }),

    ...(supportedLocales === undefined
      ? {}
      : {
          supportedLocales,
        }),

    ...(input.address === undefined
      ? {}
      : {
          address:
            normalizeAddress(
              input.address,
            ),
        }),

    ...(input.contact === undefined
      ? {}
      : {
          contact:
            normalizeFacilityContact(
              input.contact,
            ),
        }),

    ...(input.allowsAuthentication === undefined
      ? {}
      : {
          allowsAuthentication:
            input.allowsAuthentication,
        }),
  };
}

export function normalizeCreateDepartmentInput(
  input: CreateDepartmentInput,
): CreateDepartmentInput {
  return {
    facilityId:
      input.facilityId,

    parentDepartmentId:
      input.parentDepartmentId ??
      null,

    managerStaffId:
      input.managerStaffId ??
      null,

    code:
      normalizeDepartmentCode(
        input.code,
      ),

    name:
      input.name.trim(),

    description:
      normalizeOptionalText(
        input.description,
      ),

    departmentType:
      input.departmentType,

    isClinical:
      input.isClinical,

    location:
      normalizeOptionalText(
        input.location,
      ),

    costCenterCode:
      normalizeOptionalText(
        input.costCenterCode,
      )?.toLocaleUpperCase(
        'en-US',
      ) ?? null,

    contact:
      normalizeDepartmentContact(
        input.contact,
      ),
  };
}

export function normalizeUpdateDepartmentInput(
  input: UpdateDepartmentInput,
): UpdateDepartmentInput {
  return {
    expectedVersion:
      input.expectedVersion,

    ...(input.parentDepartmentId === undefined
      ? {}
      : {
          parentDepartmentId:
            input.parentDepartmentId,
        }),

    ...(input.managerStaffId === undefined
      ? {}
      : {
          managerStaffId:
            input.managerStaffId,
        }),

    ...(input.name === undefined
      ? {}
      : {
          name:
            input.name.trim(),
        }),

    ...(input.description === undefined
      ? {}
      : {
          description:
            normalizeOptionalText(
              input.description,
            ),
        }),

    ...(input.departmentType === undefined
      ? {}
      : {
          departmentType:
            input.departmentType,
        }),

    ...(input.isClinical === undefined
      ? {}
      : {
          isClinical:
            input.isClinical,
        }),

    ...(input.location === undefined
      ? {}
      : {
          location:
            normalizeOptionalText(
              input.location,
            ),
        }),

    ...(input.costCenterCode === undefined
      ? {}
      : {
          costCenterCode:
            normalizeOptionalText(
              input.costCenterCode,
            )?.toLocaleUpperCase(
              'en-US',
            ) ?? null,
        }),

    ...(input.contact === undefined
      ? {}
      : {
          contact:
            normalizeDepartmentContact(
              input.contact,
            ),
        }),
  };
}

export async function assertFacilityActive(
  repository: FacilityRepository,
  facilityId: string,
): Promise<FacilityRecord> {
  const facility =
    await repository.findById(
      facilityId,
    );

  if (facility === null) {
    throw new FacilityNotFoundError();
  }

  if (
    facility.status !==
    FACILITY_STATUS.ACTIVE
  ) {
    throw new InvalidFacilityHierarchyError(
      'Departments cannot be managed under an inactive facility',
    );
  }

  return facility;
}

export async function assertFacilityParentChain(
  repository: FacilityRepository,
  candidateParentId: string | null,
  facilityId?: string,
): Promise<void> {
  if (candidateParentId === null) {
    return;
  }

  if (
    facilityId !== undefined &&
    candidateParentId === facilityId
  ) {
    throw new InvalidFacilityHierarchyError(
      'A facility cannot be its own parent',
    );
  }

  const visited =
    new Set<string>();

  let currentId:
    string | null =
    candidateParentId;

  for (
    let depth = 0;
    currentId !== null;
    depth += 1
  ) {
    if (depth >= 100) {
      throw new InvalidFacilityHierarchyError(
        'Facility hierarchy exceeds the supported depth',
      );
    }

    if (visited.has(currentId)) {
      throw new InvalidFacilityHierarchyError(
        'The existing facility hierarchy contains a cycle',
      );
    }

    visited.add(currentId);

    if (
      facilityId !== undefined &&
      currentId === facilityId
    ) {
      throw new InvalidFacilityHierarchyError(
        'The selected parent would create a facility hierarchy cycle',
      );
    }

    const current =
      await repository.findById(
        currentId,
      );

    if (current === null) {
      throw new FacilityNotFoundError();
    }

    if (
      current.status !==
      FACILITY_STATUS.ACTIVE
    ) {
      throw new InvalidFacilityHierarchyError(
        'A facility cannot be placed below an inactive parent',
      );
    }

    currentId =
      nullableObjectIdToString(
        current.parentFacilityId,
      );
  }
}

export async function assertDepartmentParentChain(
  repository: DepartmentRepository,
  facilityId: string,
  candidateParentId: string | null,
  departmentId?: string,
): Promise<void> {
  if (candidateParentId === null) {
    return;
  }

  if (
    departmentId !== undefined &&
    candidateParentId === departmentId
  ) {
    throw new InvalidDepartmentHierarchyError(
      'A department cannot be its own parent',
    );
  }

  const visited =
    new Set<string>();

  let currentId:
    string | null =
    candidateParentId;

  for (
    let depth = 0;
    currentId !== null;
    depth += 1
  ) {
    if (depth >= 100) {
      throw new InvalidDepartmentHierarchyError(
        'Department hierarchy exceeds the supported depth',
      );
    }

    if (visited.has(currentId)) {
      throw new InvalidDepartmentHierarchyError(
        'The existing department hierarchy contains a cycle',
      );
    }

    visited.add(currentId);

    if (
      departmentId !== undefined &&
      currentId === departmentId
    ) {
      throw new InvalidDepartmentHierarchyError(
        'The selected parent would create a department hierarchy cycle',
      );
    }

    const current =
      await repository.findByIdInFacility(
        currentId,
        facilityId,
      );

    if (current === null) {
      throw new DepartmentNotFoundError();
    }

    if (
      current.status !==
      DEPARTMENT_STATUS.ACTIVE
    ) {
      throw new InvalidDepartmentHierarchyError(
        'A department cannot be placed below an inactive parent',
      );
    }

    currentId =
      nullableObjectIdToString(
        current.parentDepartmentId,
      );
  }
}

export async function assertDepartmentManager(
  facilityId: string,
  managerStaffId: string | null,
): Promise<void> {
  if (managerStaffId === null) {
    return;
  }

  const manager =
    await StaffModel.findOne({
      _id:
        toObjectId(
          managerStaffId,
          'managerStaffId',
        ),

      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      isActive:
        true,

      employmentStatus: {
        $in: [
          'ACTIVE',
          'ON_LEAVE',
        ],
      },
    })
      .select(
        '_id',
      )
      .lean()
      .exec();

  if (manager === null) {
    throw new ConflictError(
      'Department manager must be active staff assigned to the same facility',
    );
  }
}

export function changedFields<
  T extends object,
>(
  before: T,
  after: T,
  fields:
    readonly (keyof T)[],
): string[] {
  return fields
    .filter(
      (field) =>
        JSON.stringify(
          before[field],
        ) !==
        JSON.stringify(
          after[field],
        ),
    )
    .map(
      (field) =>
        String(field),
    );
}

export function facilityChangedFields(
  before: FacilityDto,
  after: FacilityDto,
): string[] {
  return changedFields(
    before,
    after,
    [
      'name',
      'legalName',
      'parentFacilityId',
      'identifiers',
      'timezone',
      'currency',
      'locale',
      'supportedLocales',
      'address',
      'contact',
      'allowsAuthentication',
    ],
  );
}

export function departmentChangedFields(
  before: DepartmentDto,
  after: DepartmentDto,
): string[] {
  return changedFields(
    before,
    after,
    [
      'parentDepartmentId',
      'managerStaffId',
      'name',
      'description',
      'departmentType',
      'isClinical',
      'location',
      'costCenterCode',
      'contact',
    ],
  );
}

export function throwMappedFacilityPersistenceError(
  error: unknown,
  entity:
    | 'Facility'
    | 'Department',
  code: string,
): never {
  const duplicate =
    findDuplicateKeyError(
      error,
    );

  if (duplicate !== null) {
    const fields =
      Object.keys(
        duplicate.keyPattern ??
          duplicate.keyValue ??
          {},
      );

    if (
      entity === 'Facility' &&
      fields.includes('code')
    ) {
      throw new FacilityCodeConflictError(
        code,
      );
    }

    if (
      entity === 'Department' &&
      fields.includes('code')
    ) {
      throw new DepartmentCodeConflictError(
        code,
      );
    }

    throw new ConflictError(
      `${entity} conflicts with an existing record`,
    );
  }

  if (error instanceof Error) {
    throw error;
  }

  throw new Error(
    `Unknown ${entity.toLocaleLowerCase(
      'en-US',
    )} persistence error`,
    {
      cause:
        error,
    },
  );
}

export function facilityPreviousSnapshot(
  record: FacilityRecord,
): Record<string, unknown> {
  return {
    name:
      record.name,

    legalName:
      record.legalName,

    parentFacilityId:
      nullableObjectIdToString(
        record.parentFacilityId,
      ),

    identifiers:
      record.identifiers,

    timezone:
      record.timezone,

    currency:
      record.currency,

    locale:
      record.locale,

    supportedLocales:
      record.supportedLocales,

    address:
      record.address,

    contact:
      record.contact,

    allowsAuthentication:
      record.allowsAuthentication,

    version:
      record.version,

    updatedBy:
      nullableObjectIdToString(
        record.updatedBy,
      ),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}

export function departmentPreviousSnapshot(
  record: DepartmentRecord,
): Record<string, unknown> {
  return {
    parentDepartmentId:
      nullableObjectIdToString(
        record.parentDepartmentId,
      ),

    managerStaffId:
      nullableObjectIdToString(
        record.managerStaffId,
      ),

    name:
      record.name,

    description:
      record.description,

    departmentType:
      record.departmentType,

    isClinical:
      record.isClinical,

    location:
      record.location,

    costCenterCode:
      record.costCenterCode,

    contact:
      record.contact,

    version:
      record.version,

    updatedBy:
      nullableObjectIdToString(
        record.updatedBy,
      ),

    updatedAt:
      record.updatedAt.toISOString(),
  };
}
import {
  collectionSpecs,
  type HospitalCollectionName,
} from './collection-specs.js';

import {
  clinicStatusValues,
  opdVisitStatusValues,
  queueDefinitionStatusValues,
  queueEntryStatusValues,
  queuePriorityClassValues,
  queuePublicDisplayModeValues,
  queueResetPolicyValues,
  queueSpecialCategoryValues,
  queueStatusChangeSourceValues,
  queueTransferReasonValues,
  registrationModeValues,
  registrationSourceValues,
  registrationStatusValues,
  serviceCounterStatusValues,
  serviceCounterTypeValues,
  servicePointStatusValues,
  servicePointTypeValues,
  triagePriorityValues,
  visitTypeValues,
} from '../models/registration-queue.types.js';

const objectId = {
  bsonType: 'objectId',
} as const;

const date = {
  bsonType: 'date',
} as const;

const string = {
  bsonType: 'string',
} as const;

const number = {
  bsonType: 'number',
} as const;

const boolean = {
  bsonType: 'bool',
} as const;

const nullableObjectId = {
  bsonType: ['objectId', 'null'],
} as const;

const nullableDate = {
  bsonType: ['date', 'null'],
} as const;

const nullableString = {
  bsonType: ['string', 'null'],
} as const;

const authProperties: Partial<
  Record<
    HospitalCollectionName,
    Record<string, unknown>
  >
> = {
  users: {
    publicId: string,
    username: string,
    normalizedUsername: string,
    email: string,
    normalizedEmail: string,
    displayName: string,
    passwordHash: string,
    status: {
      bsonType: 'string',
      enum: [
        'ACTIVE',
        'LOCKED',
        'DISABLED',
      ],
    },
    failedLoginCount: {
      ...number,
      minimum: 0,
    },
    lockedUntil: date,
    passwordChangedAt: date,
    lastLoginAt: date,
    tokenVersion: {
      ...number,
      minimum: 0,
    },
    permissionVersion: {
      ...number,
      minimum: 0,
    },
    staffId: objectId,
    createdBy: objectId,
    disabledAt: date,
    disabledBy: objectId,
    disabledReason: string,
  },

  sessions: {
    sessionId: string,
    familyId: string,
    userId: objectId,
    status: {
      bsonType: 'string',
      enum: [
        'ACTIVE',
        'REVOKED',
        'COMPROMISED',
        'EXPIRED',
      ],
    },
    userAgent: string,
    ipAddressHash: string,
    lastSeenAt: date,
    expiresAt: date,
    revokedAt: date,
    revokedBy: objectId,
    revokeReason: string,
    compromisedAt: date,
    purgeAt: date,
  },

  refreshTokens: {
    tokenId: string,
    tokenHash: string,
    sessionId: string,
    familyId: string,
    userId: objectId,
    status: {
      bsonType: 'string',
      enum: [
        'ACTIVE',
        'ROTATED',
        'REVOKED',
        'REUSED',
        'EXPIRED',
      ],
    },
    issuedAt: date,
    expiresAt: date,
    rotatedAt: date,
    replacedByTokenId: string,
    revokedAt: date,
    revokedBy: objectId,
    revokeReason: string,
    reuseDetectedAt: date,
    purgeAt: date,
  },
};

const registrationQueueProperties: Partial<
  Record<HospitalCollectionName, Record<string, unknown>>
> = {
  opdClinics: {
    departmentId: objectId,
    code: string,
    name: string,
    description: nullableString,
    location: nullableString,
    defaultProviderId: nullableObjectId,
    status: {
      bsonType: 'string',
      enum: [...clinicStatusValues],
    },
    deactivatedAt: nullableDate,
    deactivatedBy: nullableObjectId,
    deactivationReason: nullableString,
    createdBy: objectId,
    updatedBy: objectId,
  },

  servicePoints: {
    departmentId: objectId,
    clinicId: nullableObjectId,
    code: string,
    name: string,
    servicePointType: {
      bsonType: 'string',
      enum: [...servicePointTypeValues],
    },
    location: nullableString,
    defaultProviderId: nullableObjectId,
    allowsWalkIn: boolean,
    allowsAppointment: boolean,
    allowsReferral: boolean,
    allowsEmergency: boolean,
    status: {
      bsonType: 'string',
      enum: [...servicePointStatusValues],
    },
    deactivatedAt: nullableDate,
    deactivatedBy: nullableObjectId,
    deactivationReason: nullableString,
    createdBy: objectId,
    updatedBy: objectId,
  },

  serviceCounters: {
    departmentId: objectId,
    clinicId: nullableObjectId,
    servicePointId: nullableObjectId,
    code: string,
    name: string,
    counterType: {
      bsonType: 'string',
      enum: [...serviceCounterTypeValues],
    },
    queueDefinitionIds: {
      bsonType: 'array',
      items: objectId,
    },
    status: {
      bsonType: 'string',
      enum: [...serviceCounterStatusValues],
    },
    activeUserId: nullableObjectId,
    activeProviderId: nullableObjectId,
    openedAt: nullableDate,
    closedAt: nullableDate,
    statusReason: nullableString,
    createdBy: objectId,
    updatedBy: objectId,
  },

  registrations: {
    registrationNumber: string,
    patientId: objectId,
    requestedPatientId: objectId,
    canonicalRedirected: boolean,
    registrationMode: {
      bsonType: 'string',
      enum: [...registrationModeValues],
    },
    registrationSource: {
      bsonType: 'string',
      enum: [...registrationSourceValues],
    },
    visitType: {
      bsonType: 'string',
      enum: [...visitTypeValues],
    },
    status: {
      bsonType: 'string',
      enum: [...registrationStatusValues],
    },
    serviceDate: string,
    arrivedAt: date,
    checkedInAt: nullableDate,
    appointmentId: nullableObjectId,
    referralId: nullableObjectId,
    referralReference: nullableString,
    emergencyCaseId: nullableObjectId,
    departmentId: objectId,
    clinicId: nullableObjectId,
    servicePointId: nullableObjectId,
    assignedProviderId: nullableObjectId,
    registrationNotes: nullableString,
    cancelledAt: nullableDate,
    cancelledBy: nullableObjectId,
    cancellationReason: nullableString,
    supersedesRegistrationId: nullableObjectId,
    supersededByRegistrationId: nullableObjectId,
    correctionReason: nullableString,
    transactionId: string,
    correlationId: string,
    createdBy: objectId,
    updatedBy: objectId,
  },

  opdVisits: {
    visitNumber: string,
    registrationId: objectId,
    patientId: objectId,
    requestedPatientId: objectId,
    canonicalRedirected: boolean,
    serviceDate: string,
    visitType: {
      bsonType: 'string',
      enum: [...visitTypeValues],
    },
    registrationSource: {
      bsonType: 'string',
      enum: [...registrationSourceValues],
    },
    status: {
      bsonType: 'string',
      enum: [...opdVisitStatusValues],
    },
    departmentId: objectId,
    clinicId: nullableObjectId,
    servicePointId: nullableObjectId,
    assignedProviderId: nullableObjectId,
    assignedCounterId: nullableObjectId,
    currentQueueTokenId: nullableObjectId,
    activeVisitKey: nullableString,
    arrivedAt: date,
    checkedInAt: nullableDate,
    queuedAt: nullableDate,
    serviceStartedAt: nullableDate,
    completedAt: nullableDate,
    cancelledAt: nullableDate,
    cancelledBy: nullableObjectId,
    cancellationReason: nullableString,
    noShowAt: nullableDate,
    noShowMarkedBy: nullableObjectId,
    supersedesVisitId: nullableObjectId,
    supersededByVisitId: nullableObjectId,
    correctionReason: nullableString,
    transactionId: string,
    correlationId: string,
    createdBy: objectId,
    updatedBy: objectId,
  },

  queueDefinitions: {
    departmentId: objectId,
    clinicId: nullableObjectId,
    servicePointId: nullableObjectId,
    providerId: nullableObjectId,
    code: string,
    name: string,
    displayLabel: string,
    tokenPrefix: string,
    resetPolicy: {
      bsonType: 'string',
      enum: [...queueResetPolicyValues],
    },
    timezone: string,
    estimatedServiceMinutes: number,
    maximumRecallCount: number,
    allowPriority: boolean,
    allowEmergencyOverride: boolean,
    publicDisplayEnabled: boolean,
    publicDisplayMode: {
      bsonType: 'string',
      enum: [...queuePublicDisplayModeValues],
    },
    status: {
      bsonType: 'string',
      enum: [...queueDefinitionStatusValues],
    },
    deactivatedAt: nullableDate,
    deactivatedBy: nullableObjectId,
    deactivationReason: nullableString,
    createdBy: objectId,
    updatedBy: objectId,
  },

  queueTokens: {
    queueEntryId: string,
    registrationId: objectId,
    opdVisitId: objectId,
    patientId: objectId,
    queueDefinitionId: objectId,
    serviceDate: string,
    tokenNumber: number,
    tokenPrefix: string,
    tokenLabel: string,
    status: {
      bsonType: 'string',
      enum: [...queueEntryStatusValues],
    },
    priorityClass: {
      bsonType: 'string',
      enum: [...queuePriorityClassValues],
    },
    priorityScore: number,
    triagePriority: {
      bsonType: 'string',
      enum: [...triagePriorityValues],
    },
    emergencyOverride: boolean,
    emergencyOverrideReason: nullableString,
    specialCategories: {
      bsonType: 'array',
      items: {
        bsonType: 'string',
        enum: [...queueSpecialCategoryValues],
      },
    },
    assignedProviderId: nullableObjectId,
    assignedCounterId: nullableObjectId,
    activeEntryKey: nullableString,
    queuedAt: date,
    calledAt: nullableDate,
    servingAt: nullableDate,
    skippedAt: nullableDate,
    transferredAt: nullableDate,
    completedAt: nullableDate,
    cancelledAt: nullableDate,
    noShowAt: nullableDate,
    skipCount: number,
    recallCount: number,
    transferCount: number,
    estimatedWaitMinutes: {
      bsonType: ['number', 'null'],
    },
    estimatedServiceAt: nullableDate,
    transferredFromQueueTokenId: nullableObjectId,
    transferredToQueueTokenId: nullableObjectId,
    transferReason: {
      bsonType: ['string', 'null'],
      enum: [...queueTransferReasonValues, null],
    },
    statusReason: nullableString,
    lastStatusChangedAt: date,
    lastStatusChangedBy: objectId,
    transactionId: string,
    correlationId: string,
    createdBy: objectId,
    updatedBy: objectId,
  },

  queueStatusHistories: {
    queueTokenId: objectId,
    queueEntryId: string,
    opdVisitId: objectId,
    patientId: objectId,
    sequence: number,
    fromStatus: {
      bsonType: ['string', 'null'],
      enum: [...queueEntryStatusValues, null],
    },
    toStatus: {
      bsonType: 'string',
      enum: [...queueEntryStatusValues],
    },
    queueDefinitionId: objectId,
    destinationQueueDefinitionId: nullableObjectId,
    providerId: nullableObjectId,
    destinationProviderId: nullableObjectId,
    counterId: nullableObjectId,
    destinationCounterId: nullableObjectId,
    changeSource: {
      bsonType: 'string',
      enum: [...queueStatusChangeSourceValues],
    },
    transferReason: {
      bsonType: ['string', 'null'],
      enum: [...queueTransferReasonValues, null],
    },
    reason: nullableString,
    occurredAt: date,
    changedBy: objectId,
    transactionId: string,
    correlationId: string,
    createdBy: objectId,
    updatedBy: objectId,
  },
};

const required: Partial<
  Record<
    HospitalCollectionName,
    readonly string[]
  >
> = {
  users: [
    'facilityId',
    'publicId',
    'username',
    'normalizedUsername',
    'displayName',
    'passwordHash',
    'status',
    'failedLoginCount',
    'passwordChangedAt',
    'tokenVersion',
    'permissionVersion',
  ],

  sessions: [
    'facilityId',
    'sessionId',
    'familyId',
    'userId',
    'status',
    'lastSeenAt',
    'expiresAt',
    'purgeAt',
  ],

  refreshTokens: [
    'facilityId',
    'tokenId',
    'tokenHash',
    'sessionId',
    'familyId',
    'userId',
    'status',
    'issuedAt',
    'expiresAt',
    'purgeAt',
  ],

  patients: [
    'facilityId',
    'enterprisePatientId',
    'firstName',
    'displayName',
    'normalizedFullName',
    'nameSearchTokens',
    'localizedNames',
    'birthDate',
    'isMinor',
    'guardianRequirement',
    'sexAtBirth',
    'genderIdentity',
    'preferredLocale',
    'nationalityCountryCode',
    'status',
    'mergeState',
    'identityReviewRequired',
    'duplicateReviewRequired',
    'registrationSource',
    'registeredAt',
  ],

  patientIdentifiers: [
    'facilityId',
    'patientId',
    'issuingFacilityId',
    'identifierType',
    'scope',
    'normalizedValue',
    'displayValue',
    'issuingCountryCode',
    'isPrimaryIdentity',
    'isPrimaryMrn',
    'verificationStatus',
    'status',
  ],

  guardians: [
    'facilityId',
    'enterpriseGuardianId',
    'firstName',
    'displayName',
    'normalizedFullName',
    'localizedNames',
    'address',
    'preferredLocale',
    'status',
  ],

  patientGuardians: [
    'facilityId',
    'patientId',
    'guardianId',
    'relationshipType',
    'isPrimary',
    'isEmergencyContact',
    'livesWithPatient',
    'isFinanciallyResponsible',
    'legalAuthorityStatus',
    'canConsentToTreatment',
    'canConsentToDisclosure',
    'canReceiveClinicalInformation',
    'verificationStatus',
    'supportingAttachmentIds',
    'isActive',
  ],

  patientContacts: [
    'facilityId',
    'patientId',
    'contactType',
    'purpose',
    'normalizedValue',
    'displayValue',
    'isPrimary',
    'isEmergencyContact',
    'consentToContact',
    'isVerified',
    'status',
  ],

  patientAddresses: [
    'facilityId',
    'patientId',
    'addressType',
    'line1',
    'city',
    'countryCode',
    'isPrimary',
    'status',
  ],

  patientAlerts: [
    'facilityId',
    'patientId',
    'alertType',
    'severity',
    'visibility',
    'title',
    'details',
    'effectiveFrom',
    'status',
  ],

  opdClinics: [
    'facilityId',
    'departmentId',
    'code',
    'name',
    'status',
    'createdBy',
    'updatedBy',
  ],

  servicePoints: [
    'facilityId',
    'departmentId',
    'code',
    'name',
    'servicePointType',
    'allowsWalkIn',
    'allowsAppointment',
    'allowsReferral',
    'allowsEmergency',
    'status',
    'createdBy',
    'updatedBy',
  ],

  serviceCounters: [
    'facilityId',
    'departmentId',
    'code',
    'name',
    'counterType',
    'queueDefinitionIds',
    'status',
    'createdBy',
    'updatedBy',
  ],

  registrations: [
    'facilityId',
    'registrationNumber',
    'patientId',
    'requestedPatientId',
    'canonicalRedirected',
    'registrationMode',
    'registrationSource',
    'visitType',
    'status',
    'serviceDate',
    'arrivedAt',
    'departmentId',
    'transactionId',
    'correlationId',
    'createdBy',
    'updatedBy',
  ],

  opdVisits: [
    'facilityId',
    'visitNumber',
    'registrationId',
    'patientId',
    'requestedPatientId',
    'canonicalRedirected',
    'serviceDate',
    'visitType',
    'registrationSource',
    'status',
    'departmentId',
    'arrivedAt',
    'transactionId',
    'correlationId',
    'createdBy',
    'updatedBy',
  ],

  queueDefinitions: [
    'facilityId',
    'departmentId',
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
    'createdBy',
    'updatedBy',
  ],

  numberSequences: [
    'facilityId',
    'key',
    'currentValue',
  ],

  queueTokens: [
    'facilityId',
    'queueEntryId',
    'registrationId',
    'opdVisitId',
    'patientId',
    'queueDefinitionId',
    'serviceDate',
    'tokenNumber',
    'tokenPrefix',
    'tokenLabel',
    'status',
    'priorityClass',
    'priorityScore',
    'triagePriority',
    'emergencyOverride',
    'specialCategories',
    'queuedAt',
    'skipCount',
    'recallCount',
    'transferCount',
    'lastStatusChangedAt',
    'lastStatusChangedBy',
    'transactionId',
    'correlationId',
    'createdBy',
    'updatedBy',
  ],

  queueStatusHistories: [
    'facilityId',
    'queueTokenId',
    'queueEntryId',
    'opdVisitId',
    'patientId',
    'sequence',
    'toStatus',
    'queueDefinitionId',
    'changeSource',
    'occurredAt',
    'changedBy',
    'transactionId',
    'correlationId',
    'createdBy',
    'updatedBy',
  ],

  beds: [
    'facilityId',
    'wardId',
    'bedNumber',
    'category',
    'status',
  ],

  admissionBedAssignments: [
    'facilityId',
    'admissionId',
    'bedId',
    'startedAt',
    'active',
    'transactionId',
  ],

  inventoryBatches: [
    'facilityId',
    'itemId',
    'batchNumber',
    'expiryDate',
    'costPrice',
    'sellingPrice',
    'currency',
  ],

  stockBalances: [
    'facilityId',
    'storeLocationId',
    'itemId',
    'batchId',
    'availableQuantity',
    'reservedQuantity',
  ],

  stockMovements: [
    'facilityId',
    'movementNumber',
    'itemId',
    'batchId',
    'storeLocationId',
    'movementType',
    'quantity',
    'direction',
    'sourceType',
    'sourceId',
    'transactionId',
    'operationKey',
    'occurredAt',
  ],

  prescriptions: [
    'facilityId',
    'prescriptionNumber',
    'patientId',
    'encounterId',
    'doctorId',
    'status',
  ],

  invoices: [
    'facilityId',
    'patientId',
    'patientAccountId',
    'status',
    'currency',
    'grossAmount',
    'netAmount',
    'outstandingAmount',
  ],

  claims: [
    'facilityId',
    'claimNumber',
    'patientId',
    'invoiceId',
    'payerOrganizationId',
    'status',
    'claimedAmount',
  ],

  applicationTransactions: [
    'facilityId',
    'transactionId',
    'transactionType',
    'idempotencyKey',
    'correlationId',
    'initiatedBy',
    'status',
  ],

  applicationTransactionSteps: [
    'facilityId',
    'transactionId',
    'sequence',
    'name',
    'status',
  ],

  idempotencyKeys: [
    'facilityId',
    'scope',
    'key',
    'requestHash',
    'status',
  ],

  operationLocks: [
    'facilityId',
    'resourceType',
    'resourceKey',
    'ownerId',
    'leaseToken',
    'leaseExpiresAt',
  ],

  outboxEvents: [
    'facilityId',
    'eventId',
    'transactionId',
    'eventType',
    'aggregateType',
    'aggregateId',
    'payload',
    'status',
    'availableAt',
  ],

  auditLogs: [
    'facilityId',
    'actorId',
    'action',
    'module',
    'entityType',
    'entityId',
    'correlationId',
    'occurredAt',
  ],
};

export function jsonSchemaFor(
  name: HospitalCollectionName,
): Record<string, unknown> {
  const spec = collectionSpecs.find(
    (candidate) => candidate.name === name,
  );

  if (spec === undefined) {
    throw new Error(`Unknown collection ${name}`);
  }

  const commonRequired = [
    'schemaVersion',
    'version',
    'createdAt',
    'updatedAt',
  ];

  const fallbackRequired = spec.facilityScoped
    ? [
        'facilityId',
        'data',
      ]
    : [
        'data',
      ];

  return {
    bsonType: 'object',
    required: [
      ...commonRequired,
      ...(required[name] ?? fallbackRequired),
    ],
    properties: {
      _id: objectId,
      facilityId: objectId,
      schemaVersion: {
        bsonType: 'number',
        minimum: 1,
      },
      version: {
        bsonType: 'number',
        minimum: 0,
      },
      createdAt: date,
      updatedAt: date,
      data: {
        bsonType: 'object',
      },
      ...(authProperties[name] ?? {}),
      ...(registrationQueueProperties[name] ?? {}),
    },
    additionalProperties: true,
  };
}
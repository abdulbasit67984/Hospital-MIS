import {
  collectionSpecs,
  type HospitalCollectionName,
} from './collection-specs.js';

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

  numberSequences: [
    'facilityId',
    'key',
    'currentValue',
  ],

  queueTokens: [
    'facilityId',
    'opdVisitId',
    'queueDefinitionId',
    'patientId',
    'serviceDate',
    'tokenNumber',
    'status',
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
    },
    additionalProperties: true,
  };
}
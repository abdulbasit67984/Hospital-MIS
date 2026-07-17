const facilityIdExample =
  '507f191e810c19729de860ea';

const patientIdExample =
  '507f1f77bcf86cd799439011';

const canonicalPatientIdExample =
  '507f1f77bcf86cd799439012';

const guardianIdExample =
  '507f1f77bcf86cd799439013';

const resourceIdExample =
  '507f1f77bcf86cd799439014';

const mergeIdExample =
  'bc401615-90a2-4a95-b5dc-493b996f8497';

const bearerSecurity = [
  {
    bearerAuth:
      [],
  },
] as const;

const idempotencyParameter = {
  name:
    'Idempotency-Key',

  in:
    'header',

  required:
    true,

  description:
    'Unique replay-safe mutation key. Reusing a key with a different request is rejected.',

  schema: {
    type:
      'string',

    minLength:
      8,

    maxLength:
      200,

    pattern:
      '^[A-Za-z0-9._:-]+$',

    example:
      'patient-operation-20260718-0001',
  },
} as const;

const sensitiveAccessParameter = {
  name:
    'X-Patient-Access-Level',

  in:
    'header',

  required:
    false,

  description:
    'STANDARD returns masked identity, contact, and address fields. SENSITIVE requires patients.read_sensitive and creates a sensitive-read audit record.',

  schema: {
    type:
      'string',

    enum: [
      'STANDARD',
      'SENSITIVE',
    ],

    default:
      'STANDARD',
  },
} as const;

function objectIdParameter(
  name:
    string,

  description:
    string,

  example =
    resourceIdExample,
) {
  return {
    name,

    in:
      'path',

    required:
      true,

    description,

    schema: {
      type:
        'string',

      pattern:
        '^[a-fA-F0-9]{24}$',

      example,
    },
  } as const;
}

const patientIdParameter =
  objectIdParameter(
    'patientId',
    'Patient database identifier used internally by the API. MRN remains the patient-facing identifier.',
    patientIdExample,
  );

const guardianIdParameter =
  objectIdParameter(
    'guardianId',
    'Guardian identifier',
    guardianIdExample,
  );

const identifierIdParameter =
  objectIdParameter(
    'identifierId',
    'Patient identifier record identifier',
  );

const relationshipIdParameter =
  objectIdParameter(
    'relationshipId',
    'Patient-to-guardian relationship identifier',
  );

const contactIdParameter =
  objectIdParameter(
    'contactId',
    'Patient contact identifier',
  );

const addressIdParameter =
  objectIdParameter(
    'addressId',
    'Patient address identifier',
  );

const alertIdParameter =
  objectIdParameter(
    'alertId',
    'Patient alert identifier',
  );

const mergeIdParameter = {
  name:
    'mergeId',

  in:
    'path',

  required:
    true,

  description:
    'Immutable patient merge audit identifier',

  schema: {
    type:
      'string',

    format:
      'uuid',

    example:
      mergeIdExample,
  },
} as const;

const apiErrorContent = {
  'application/json': {
    schema: {
      $ref:
        '#/components/schemas/ApiError',
    },
  },
} as const;

const standardErrors = {
  '400': {
    description:
      'Request validation failed',

    content:
      apiErrorContent,
  },

  '401': {
    description:
      'Authentication is required',

    content:
      apiErrorContent,
  },

  '403': {
    description:
      'Permission or sensitive-record access was denied',

    content:
      apiErrorContent,
  },

  '404': {
    description:
      'Patient, guardian, relationship, or profile resource was not found',

    content:
      apiErrorContent,
  },

  '409': {
    description:
      'Duplicate identity, lifecycle restriction, idempotency mismatch, or optimistic-concurrency conflict',

    content:
      apiErrorContent,
  },
} as const;

function requestBody(
  schemaName:
    string,
) {
  return {
    required:
      true,

    content: {
      'application/json': {
        schema: {
          $ref:
            `#/components/schemas/${schemaName}`,
        },
      },
    },
  } as const;
}

function mutationOperation(
  input: Readonly<{
    tag: string;
    summary: string;
    description?: string;
    schemaName: string;
    parameters?: readonly Record<string, unknown>[];
    successStatus?: '200' | '201';
    successDescription: string;
  }>,
) {
  const successStatus =
    input.successStatus ??
    '200';

  return {
    tags: [
      input.tag,
    ],

    summary:
      input.summary,

    ...(input.description ===
    undefined
      ? {}
      : {
          description:
            input.description,
        }),

    security:
      bearerSecurity,

    parameters: [
      ...(input.parameters ??
        []),
      idempotencyParameter,
    ],

    requestBody:
      requestBody(
        input.schemaName,
      ),

    responses: {
      [successStatus]: {
        description:
          input.successDescription,
      },

      ...standardErrors,
    },
  } as const;
}

function readOperation(
  input: Readonly<{
    tag: string;
    summary: string;
    description?: string;
    parameters?: readonly Record<string, unknown>[];
    sensitive?: boolean;
    successDescription: string;
  }>,
) {
  return {
    tags: [
      input.tag,
    ],

    summary:
      input.summary,

    ...(input.description ===
    undefined
      ? {}
      : {
          description:
            input.description,
        }),

    security:
      bearerSecurity,

    parameters: [
      ...(input.parameters ??
        []),
      ...(input.sensitive
        ? [
            sensitiveAccessParameter,
          ]
        : []),
    ],

    responses: {
      '200': {
        description:
          input.successDescription,
      },

      ...standardErrors,
    },
  } as const;
}

const versionReasonProperties = {
  expectedVersion: {
    type:
      'integer',

    minimum:
      0,

    example:
      2,
  },

  reason: {
    type:
      'string',

    minLength:
      3,

    maxLength:
      1_000,

    example:
      'Verified against the original identity document.',
  },
} as const;

export const patientOpenApi = {
  tags: [
    {
      name:
        'Patients',

      description:
        'Patient registration, search, canonical profiles, duplicate review, and registration slips.',
    },

    {
      name:
        'Patient Identity',

      description:
        'CNIC, B-Form, passport, MRN, guardian identity, and verification lifecycle operations.',
    },

    {
      name:
        'Patient Profile',

      description:
        'Patient contacts, addresses, alerts, and important flags.',
    },

    {
      name:
        'Patient Merge',

      description:
        'Authorized duplicate resolution with immutable merge history and canonical redirects.',
    },

    {
      name:
        'Guardians',

      description:
        'Guardian search, profile access, and lifecycle management.',
    },
  ],

  components: {
    schemas: {
      PatientBirthDateInput: {
        type:
          'object',

        required: [
          'value',
          'precision',
          'isApproximate',
          'estimatedAgeYears',
          'estimatedAsOfDate',
        ],

        properties: {
          value: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',

            example:
              '1988-04-02T00:00:00.000Z',
          },

          precision: {
            type:
              'string',

            enum: [
              'EXACT',
              'YEAR_MONTH',
              'YEAR',
              'UNKNOWN',
            ],

            example:
              'EXACT',
          },

          isApproximate: {
            type:
              'boolean',

            example:
              false,
          },

          estimatedAgeYears: {
            type: [
              'integer',
              'null',
            ],

            minimum:
              0,

            example:
              null,
          },

          estimatedAsOfDate: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',

            example:
              null,
          },
        },
      },

      PatientIdentifierInput: {
        type:
          'object',

        required: [
          'identifierType',
          'value',
          'issuingCountryCode',
        ],

        properties: {
          identifierType: {
            type:
              'string',

            enum: [
              'CNIC',
              'B_FORM',
              'PASSPORT',
              'OTHER',
            ],

            example:
              'CNIC',
          },

          value: {
            type:
              'string',

            example:
              '35202-1234567-1',
          },

          issuingCountryCode: {
            type:
              'string',

            example:
              'PK',
          },

          issuingAuthority: {
            type: [
              'string',
              'null',
            ],

            example:
              'NADRA',
          },

          isPrimaryIdentity: {
            type:
              'boolean',

            default:
              false,
          },

          validFrom: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },

          expiresAt: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },
        },
      },

      RegisterPatientRequest: {
        type:
          'object',

        required: [
          'firstName',
          'birthDate',
          'isMinor',
          'sexAtBirth',
        ],

        properties: {
          firstName: {
            type:
              'string',

            example:
              'Ayesha',
          },

          middleName: {
            type: [
              'string',
              'null',
            ],

            example:
              null,
          },

          lastName: {
            type: [
              'string',
              'null',
            ],

            example:
              'Khan',
          },

          preferredName: {
            type: [
              'string',
              'null',
            ],

            example:
              null,
          },

          birthDate: {
            $ref:
              '#/components/schemas/PatientBirthDateInput',
          },

          isMinor: {
            type:
              'boolean',

            example:
              false,
          },

          sexAtBirth: {
            type:
              'string',

            enum: [
              'FEMALE',
              'MALE',
              'INTERSEX',
              'UNKNOWN',
            ],

            example:
              'FEMALE',
          },

          genderIdentity: {
            type:
              'string',

            example:
              'NOT_DISCLOSED',
          },

          preferredLocale: {
            type:
              'string',

            example:
              'en-PK',
          },

          nationalityCountryCode: {
            type:
              'string',

            example:
              'PK',
          },

          registrationSource: {
            type:
              'string',

            example:
              'RECEPTION',
          },

          identifiers: {
            type:
              'array',

            items: {
              $ref:
                '#/components/schemas/PatientIdentifierInput',
            },
          },

          contacts: {
            type:
              'array',

            items: {
              $ref:
                '#/components/schemas/PatientContactRequest',
            },
          },

          addresses: {
            type:
              'array',

            items: {
              $ref:
                '#/components/schemas/PatientAddressRequest',
            },
          },

          guardian: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/GuardianInput',
              },
              {
                type:
                  'null',
              },
            ],
          },

          guardianRelationship: {
            oneOf: [
              {
                $ref:
                  '#/components/schemas/GuardianRelationshipInput',
              },
              {
                type:
                  'null',
              },
            ],
          },
        },

        examples: [
          {
            firstName:
              'Ayesha',

            lastName:
              'Khan',

            birthDate: {
              value:
                '1988-04-02T00:00:00.000Z',

              precision:
                'EXACT',

              isApproximate:
                false,

              estimatedAgeYears:
                null,

              estimatedAsOfDate:
                null,
            },

            isMinor:
              false,

            sexAtBirth:
              'FEMALE',

            identifiers: [
              {
                identifierType:
                  'CNIC',

                value:
                  '35202-1234567-1',

                issuingCountryCode:
                  'PK',

                issuingAuthority:
                  'NADRA',

                isPrimaryIdentity:
                  true,
              },
            ],

            contacts: [
              {
                contactType:
                  'PHONE',

                purpose:
                  'PRIMARY',

                value:
                  '0300-1234567',

                isPrimary:
                  true,
              },
            ],
          },
          {
            firstName:
              'Hassan',

            lastName:
              'Ali',

            birthDate: {
              value:
                '2018-03-11T00:00:00.000Z',

              precision:
                'EXACT',

              isApproximate:
                false,

              estimatedAgeYears:
                null,

              estimatedAsOfDate:
                null,
            },

            isMinor:
              true,

            sexAtBirth:
              'MALE',

            identifiers: [
              {
                identifierType:
                  'B_FORM',

                value:
                  '35202-7654321-3',

                issuingCountryCode:
                  'PK',

                isPrimaryIdentity:
                  true,
              },
            ],

            guardian: {
              firstName:
                'Sara',

              lastName:
                'Ali',

              cnic:
                '35202-1111111-5',

              phone:
                '0301-7654321',

              address: {
                city:
                  'Lahore',

                province:
                  'Punjab',

                countryCode:
                  'PK',
              },
            },

            guardianRelationship: {
              relationshipType:
                'MOTHER',

              isPrimary:
                true,

              isEmergencyContact:
                true,

              canConsentToTreatment:
                true,

              canConsentToDisclosure:
                true,

              canReceiveClinicalInformation:
                true,
            },
          },
        ],
      },

      UpdatePatientRequest: {
        type:
          'object',

        required: [
          'expectedVersion',
          'reason',
        ],

        properties: {
          preferredName: {
            type: [
              'string',
              'null',
            ],

            example:
              'Ashi',
          },

          status: {
            type:
              'string',

            enum: [
              'ACTIVE',
              'INACTIVE',
              'DECEASED',
              'RESTRICTED',
            ],
          },

          ...versionReasonProperties,
        },
      },

      PatientDuplicateCheckRequest: {
        type:
          'object',

        required: [
          'firstName',
          'birthDate',
          'isMinor',
        ],

        properties: {
          firstName: {
            type:
              'string',

            example:
              'Ayesha',
          },

          lastName: {
            type: [
              'string',
              'null',
            ],

            example:
              'Khan',
          },

          birthDate: {
            $ref:
              '#/components/schemas/PatientBirthDateInput',
          },

          isMinor: {
            type:
              'boolean',

            example:
              false,
          },

          identifiers: {
            type:
              'array',

            items: {
              $ref:
                '#/components/schemas/PatientIdentifierInput',
            },
          },

          phones: {
            type:
              'array',

            items: {
              type:
                'string',
            },

            example: [
              '0300-1234567',
            ],
          },

          guardianCnic: {
            type: [
              'string',
              'null',
            ],
          },
        },
      },

      PatientContactRequest: {
        type:
          'object',

        required: [
          'contactType',
          'purpose',
          'value',
        ],

        properties: {
          contactType: {
            type:
              'string',

            enum: [
              'PHONE',
              'EMAIL',
            ],
          },

          purpose: {
            type:
              'string',

            example:
              'PRIMARY',
          },

          value: {
            type:
              'string',

            example:
              '0300-1234567',
          },

          contactName: {
            type: [
              'string',
              'null',
            ],
          },

          relationshipToPatient: {
            type: [
              'string',
              'null',
            ],
          },

          relatedGuardianId: {
            type: [
              'string',
              'null',
            ],

            pattern:
              '^[a-fA-F0-9]{24}$',
          },

          isPrimary: {
            type:
              'boolean',
          },

          isEmergencyContact: {
            type:
              'boolean',
          },

          consentToContact: {
            type:
              'boolean',
          },
        },
      },

      PatientContactUpdateRequest: {
        type:
          'object',

        required: [
          'expectedVersion',
          'reason',
        ],

        properties: {
          value: {
            type:
              'string',

            example:
              '0301-7654321',
          },

          isPrimary: {
            type:
              'boolean',
          },

          consentToContact: {
            type:
              'boolean',
          },

          ...versionReasonProperties,
        },
      },

      PatientAddressRequest: {
        type:
          'object',

        required: [
          'addressType',
          'line1',
          'city',
          'countryCode',
        ],

        properties: {
          addressType: {
            type:
              'string',

            example:
              'HOME',
          },

          line1: {
            type:
              'string',

            example:
              'House 12, Street 8',
          },

          line2: {
            type: [
              'string',
              'null',
            ],
          },

          city: {
            type:
              'string',

            example:
              'Lahore',
          },

          district: {
            type: [
              'string',
              'null',
            ],

            example:
              'Lahore',
          },

          province: {
            type: [
              'string',
              'null',
            ],

            example:
              'Punjab',
          },

          postalCode: {
            type: [
              'string',
              'null',
            ],

            example:
              '54000',
          },

          countryCode: {
            type:
              'string',

            example:
              'PK',
          },

          isPrimary: {
            type:
              'boolean',
          },
        },
      },

      PatientAddressUpdateRequest: {
        type:
          'object',

        required: [
          'expectedVersion',
          'reason',
        ],

        properties: {
          city: {
            type:
              'string',

            example:
              'Islamabad',
          },

          ...versionReasonProperties,
        },
      },

      PatientAlertRequest: {
        type:
          'object',

        required: [
          'alertType',
          'severity',
          'visibility',
          'title',
          'details',
        ],

        properties: {
          alertType: {
            type:
              'string',

            example:
              'LEGAL',
          },

          severity: {
            type:
              'string',

            enum: [
              'INFO',
              'WARNING',
              'CRITICAL',
            ],

            example:
              'CRITICAL',
          },

          visibility: {
            type:
              'string',

            example:
              'RESTRICTED',
          },

          title: {
            type:
              'string',

            example:
              'Restricted disclosure',
          },

          details: {
            type:
              'string',

            example:
              'Synthetic example: confirm legal authority before disclosure.',
          },

          effectiveFrom: {
            type:
              'string',

            format:
              'date-time',
          },

          effectiveTo: {
            type: [
              'string',
              'null',
            ],

            format:
              'date-time',
          },
        },
      },

      ResolvePatientAlertRequest: {
        type:
          'object',

        required: [
          'expectedVersion',
          'resolutionReason',
        ],

        properties: {
          expectedVersion:
            versionReasonProperties.expectedVersion,

          resolutionReason: {
            type:
              'string',

            example:
              'Legal restriction was formally withdrawn.',
          },
        },
      },

      GuardianInput: {
        type:
          'object',

        required: [
          'firstName',
          'cnic',
        ],

        properties: {
          firstName: {
            type:
              'string',

            example:
              'Sara',
          },

          lastName: {
            type: [
              'string',
              'null',
            ],

            example:
              'Ali',
          },

          cnic: {
            type:
              'string',

            example:
              '35202-1111111-5',
          },

          phone: {
            type: [
              'string',
              'null',
            ],

            example:
              '0301-7654321',
          },
        },
      },

      GuardianUpdateRequest: {
        type:
          'object',

        required: [
          'expectedVersion',
          'reason',
        ],

        properties: {
          phone: {
            type: [
              'string',
              'null',
            ],

            example:
              '0302-5555555',
          },

          ...versionReasonProperties,
        },
      },

      GuardianRelationshipInput: {
        type:
          'object',

        required: [
          'relationshipType',
        ],

        properties: {
          relationshipType: {
            type:
              'string',

            example:
              'MOTHER',
          },

          isPrimary: {
            type:
              'boolean',

            example:
              true,
          },

          isEmergencyContact: {
            type:
              'boolean',

            example:
              true,
          },

          canConsentToTreatment: {
            type:
              'boolean',

            example:
              true,
          },

          canConsentToDisclosure: {
            type:
              'boolean',

            example:
              true,
          },

          canReceiveClinicalInformation: {
            type:
              'boolean',

            example:
              true,
          },
        },
      },

      PatientGuardianLinkRequest: {
        type:
          'object',

        required: [
          'guardianId',
          'relationshipType',
        ],

        properties: {
          guardianId: {
            type:
              'string',

            pattern:
              '^[a-fA-F0-9]{24}$',

            example:
              guardianIdExample,
          },

          relationshipType: {
            type:
              'string',

            example:
              'MOTHER',
          },

          isPrimary: {
            type:
              'boolean',

            example:
              true,
          },

          isEmergencyContact: {
            type:
              'boolean',

            example:
              true,
          },

          canConsentToTreatment: {
            type:
              'boolean',

            example:
              true,
          },

          canConsentToDisclosure: {
            type:
              'boolean',

            example:
              true,
          },

          canReceiveClinicalInformation: {
            type:
              'boolean',

            example:
              true,
          },
        },
      },

      VerifyGuardianRelationshipRequest: {
        type:
          'object',

        required: [
          'expectedVersion',
          'reason',
        ],

        properties: {
          ...versionReasonProperties,

          verificationNotes: {
            type: [
              'string',
              'null',
            ],

            example:
              'Original documents reviewed by medical records.',
          },
        },
      },

      VersionReasonRequest: {
        type:
          'object',

        required: [
          'expectedVersion',
          'reason',
        ],

        properties:
          versionReasonProperties,
      },

      DuplicateReviewResolutionRequest: {
        type:
          'object',

        required: [
          'expectedVersion',
          'decision',
          'reason',
        ],

        properties: {
          expectedVersion:
            versionReasonProperties.expectedVersion,

          decision: {
            type:
              'string',

            enum: [
              'CONFIRMED_NOT_DUPLICATE',
              'RETAIN_FOR_REVIEW',
            ],

            example:
              'CONFIRMED_NOT_DUPLICATE',
          },

          reason:
            versionReasonProperties.reason,
        },
      },

      MergePatientsRequest: {
        type:
          'object',

        required: [
          'targetPatientId',
          'expectedSourceVersion',
          'expectedTargetVersion',
          'evidenceCodes',
          'reason',
          'acknowledgement',
        ],

        properties: {
          targetPatientId: {
            type:
              'string',

            pattern:
              '^[a-fA-F0-9]{24}$',

            example:
              canonicalPatientIdExample,
          },

          expectedSourceVersion: {
            type:
              'integer',

            minimum:
              0,

            example:
              3,
          },

          expectedTargetVersion: {
            type:
              'integer',

            minimum:
              0,

            example:
              7,
          },

          evidenceCodes: {
            type:
              'array',

            minItems:
              1,

            uniqueItems:
              true,

            items: {
              type:
                'string',

              enum: [
                'EXACT_CNIC',
                'EXACT_B_FORM',
                'EXACT_PASSPORT',
                'SAME_GUARDIAN_CNIC',
                'SAME_PHONE',
                'NAME_AND_EXACT_BIRTH_DATE',
                'NAME_AND_APPROXIMATE_BIRTH_DATE',
                'MANUAL_RECORD_REVIEW',
                'OTHER_DOCUMENTED_EVIDENCE',
              ],
            },

            example: [
              'EXACT_CNIC',
              'NAME_AND_EXACT_BIRTH_DATE',
            ],
          },

          reason: {
            type:
              'string',

            example:
              'The same identity document and demographic record were confirmed by medical records staff.',
          },

          acknowledgement: {
            type:
              'string',

            const:
              'I_CONFIRM_PATIENT_MERGE',
          },
        },
      },

      PatientSearchItem: {
        type:
          'object',

        required: [
          'id',
          'enterprisePatientId',
          'mrn',
          'displayName',
          'status',
          'matchedBy',
        ],

        properties: {
          id: {
            type:
              'string',

            example:
              patientIdExample,
          },

          enterprisePatientId: {
            type:
              'string',

            format:
              'uuid',
          },

          mrn: {
            type:
              'string',

            example:
              'MAIN-2026-000087',
          },

          displayName: {
            type:
              'string',

            example:
              'Ayesha Khan',
          },

          primaryContact: {
            type: [
              'string',
              'null',
            ],

            example:
              '*********4567',
          },

          status: {
            type:
              'string',

            example:
              'ACTIVE',
          },

          matchedBy: {
            type:
              'array',

            items: {
              type:
                'string',
            },

            example: [
              'MRN',
            ],
          },
        },
      },

      PatientProfile: {
        type:
          'object',

        description:
          'Canonical patient profile. Sensitive fields are masked unless X-Patient-Access-Level is SENSITIVE and the caller has patients.read_sensitive.',
      },

      GuardianProfile: {
        type:
          'object',

        description:
          'Guardian identity and linked-patient summary with permission-aware masking.',
      },

      PatientRegistrationSlip: {
        type:
          'object',

        required: [
          'documentType',
          'mrn',
          'displayName',
          'machineReadableValue',
          'generatedAt',
        ],

        properties: {
          documentType: {
            type:
              'string',

            const:
              'PATIENT_REGISTRATION_SLIP',
          },

          mrn: {
            type:
              'string',

            example:
              'MAIN-2026-000087',
          },

          displayName: {
            type:
              'string',

            example:
              'Ayesha Khan',
          },

          machineReadableValue: {
            type:
              'string',

            example:
              'MRN:MAIN-2026-000087',
          },

          generatedAt: {
            type:
              'string',

            format:
              'date-time',
          },
        },
      },

      PatientMergeRecord: {
        type:
          'object',

        description:
          'Immutable merge history containing source and target MRNs, evidence codes, actor, reason, correlation ID, and version transitions.',
      },
    },
  },

  paths: {
    '/patients/search': {
      get:
        readOperation({
          tag:
            'Patients',

          summary:
            'Search patients',

          description:
            'Search by MRN, CNIC, B-Form, guardian CNIC, phone, or name. Merged matches are resolved to the canonical patient.',

          sensitive:
            true,

          parameters: [
            {
              name:
                'term',

              in:
                'query',

              required:
                true,

              schema: {
                type:
                  'string',

                minLength:
                  2,

                example:
                  'MAIN-2026-000087',
              },
            },
            {
              name:
                'mode',

              in:
                'query',

              required:
                false,

              schema: {
                type:
                  'string',

                enum: [
                  'AUTO',
                  'MRN',
                  'CNIC',
                  'B_FORM',
                  'GUARDIAN_CNIC',
                  'PHONE',
                  'NAME',
                ],

                default:
                  'AUTO',
              },
            },
            {
              name:
                'page',

              in:
                'query',

              schema: {
                type:
                  'integer',

                minimum:
                  1,

                default:
                  1,
              },
            },
            {
              name:
                'pageSize',

              in:
                'query',

              schema: {
                type:
                  'integer',

                minimum:
                  1,

                maximum:
                  50,

                default:
                  20,
              },
            },
          ],

          successDescription:
            'Canonicalized patient search page returned',
        }),
    },

    '/patients/duplicate-check': {
      post: {
        tags: [
          'Patients',
        ],

        summary:
          'Assess duplicate-patient risk',

        description:
          'Checks exact identity, guardian CNIC, phone, name, and birth-date evidence before registration.',

        security:
          bearerSecurity,

        requestBody:
          requestBody(
            'PatientDuplicateCheckRequest',
          ),

        responses: {
          '200': {
            description:
              'Duplicate assessment returned',
          },

          ...standardErrors,
        },
      },
    },

    '/patients': {
      post:
        mutationOperation({
          tag:
            'Patients',

          summary:
            'Register a patient',

          description:
            'Creates a permanent concurrency-safe MRN. Minor registration requires a guardian CNIC and guardian relationship.',

          schemaName:
            'RegisterPatientRequest',

          successStatus:
            '201',

          successDescription:
            'Patient registered with permanent MRN',
        }),
    },

    '/patients/{patientId}': {
      get:
        readOperation({
          tag:
            'Patients',

          summary:
            'Get canonical patient profile',

          description:
            'Merged patient identifiers redirect to the canonical patient profile. Restricted alert details remain filtered according to access level.',

          sensitive:
            true,

          parameters: [
            patientIdParameter,
          ],

          successDescription:
            'Patient profile returned',
        }),

      patch:
        mutationOperation({
          tag:
            'Patients',

          summary:
            'Update patient demographics or status',

          schemaName:
            'UpdatePatientRequest',

          parameters: [
            patientIdParameter,
          ],

          successDescription:
            'Patient updated',
        }),
    },

    '/patients/{patientId}/canonical': {
      get:
        readOperation({
          tag:
            'Patients',

          summary:
            'Resolve canonical patient',

          parameters: [
            patientIdParameter,
          ],

          successDescription:
            'Canonical patient resolution returned',
        }),
    },

    '/patients/{patientId}/registration-slip': {
      get:
        readOperation({
          tag:
            'Patients',

          summary:
            'Generate patient registration slip data',

          description:
            'Returns print-safe MRN, demographic summary, masked primary contact, guardian names, and machine-readable MRN value.',

          parameters: [
            patientIdParameter,
          ],

          successDescription:
            'Registration-slip data returned',
        }),
    },

    '/patients/{patientId}/identifiers': {
      post:
        mutationOperation({
          tag:
            'Patient Identity',

          summary:
            'Add a patient identity document',

          schemaName:
            'PatientIdentifierInput',

          parameters: [
            patientIdParameter,
          ],

          successStatus:
            '201',

          successDescription:
            'Patient identifier added',
        }),
    },

    '/patients/identifiers/{identifierId}/verify': {
      post:
        mutationOperation({
          tag:
            'Patient Identity',

          summary:
            'Verify a patient identifier',

          schemaName:
            'VersionReasonRequest',

          parameters: [
            identifierIdParameter,
          ],

          successDescription:
            'Patient identifier verified',
        }),
    },

    '/patients/identifiers/{identifierId}/revoke': {
      post:
        mutationOperation({
          tag:
            'Patient Identity',

          summary:
            'Revoke a patient identifier',

          description:
            'Permanent MRNs cannot be revoked.',

          schemaName:
            'VersionReasonRequest',

          parameters: [
            identifierIdParameter,
          ],

          successDescription:
            'Patient identifier revoked',
        }),
    },

    '/patients/{patientId}/guardians': {
      post:
        mutationOperation({
          tag:
            'Patient Identity',

          summary:
            'Link an existing guardian to a patient',

          schemaName:
            'PatientGuardianLinkRequest',

          parameters: [
            patientIdParameter,
          ],

          successStatus:
            '201',

          successDescription:
            'Guardian relationship created',
        }),
    },

    '/patients/guardian-relationships/{relationshipId}/verify': {
      post:
        mutationOperation({
          tag:
            'Patient Identity',

          summary:
            'Verify guardian legal authority',

          schemaName:
            'VerifyGuardianRelationshipRequest',

          parameters: [
            relationshipIdParameter,
          ],

          successDescription:
            'Guardian relationship verified',
        }),
    },

    '/patients/guardian-relationships/{relationshipId}/end': {
      post:
        mutationOperation({
          tag:
            'Patient Identity',

          summary:
            'End a guardian relationship',

          description:
            'The final valid guardian relationship for an active minor cannot be ended.',

          schemaName:
            'VersionReasonRequest',

          parameters: [
            relationshipIdParameter,
          ],

          successDescription:
            'Guardian relationship ended',
        }),
    },

    '/patients/{patientId}/contacts': {
      post:
        mutationOperation({
          tag:
            'Patient Profile',

          summary:
            'Add patient contact information',

          schemaName:
            'PatientContactRequest',

          parameters: [
            patientIdParameter,
          ],

          successStatus:
            '201',

          successDescription:
            'Patient contact added',
        }),
    },

    '/patients/contacts/{contactId}': {
      patch:
        mutationOperation({
          tag:
            'Patient Profile',

          summary:
            'Update a patient contact',

          schemaName:
            'PatientContactUpdateRequest',

          parameters: [
            contactIdParameter,
          ],

          successDescription:
            'Patient contact updated',
        }),
    },

    '/patients/contacts/{contactId}/verify': {
      post:
        mutationOperation({
          tag:
            'Patient Profile',

          summary:
            'Verify a patient contact',

          schemaName:
            'VersionReasonRequest',

          parameters: [
            contactIdParameter,
          ],

          successDescription:
            'Patient contact verified',
        }),
    },

    '/patients/contacts/{contactId}/deactivate': {
      post:
        mutationOperation({
          tag:
            'Patient Profile',

          summary:
            'Deactivate a patient contact',

          schemaName:
            'VersionReasonRequest',

          parameters: [
            contactIdParameter,
          ],

          successDescription:
            'Patient contact deactivated',
        }),
    },

    '/patients/{patientId}/addresses': {
      post:
        mutationOperation({
          tag:
            'Patient Profile',

          summary:
            'Add a patient address',

          schemaName:
            'PatientAddressRequest',

          parameters: [
            patientIdParameter,
          ],

          successStatus:
            '201',

          successDescription:
            'Patient address added',
        }),
    },

    '/patients/addresses/{addressId}': {
      patch:
        mutationOperation({
          tag:
            'Patient Profile',

          summary:
            'Update a patient address',

          schemaName:
            'PatientAddressUpdateRequest',

          parameters: [
            addressIdParameter,
          ],

          successDescription:
            'Patient address updated',
        }),
    },

    '/patients/addresses/{addressId}/deactivate': {
      post:
        mutationOperation({
          tag:
            'Patient Profile',

          summary:
            'Deactivate a patient address',

          schemaName:
            'VersionReasonRequest',

          parameters: [
            addressIdParameter,
          ],

          successDescription:
            'Patient address deactivated',
        }),
    },

    '/patients/{patientId}/alerts': {
      post:
        mutationOperation({
          tag:
            'Patient Profile',

          summary:
            'Create a patient alert or important flag',

          schemaName:
            'PatientAlertRequest',

          parameters: [
            patientIdParameter,
          ],

          successStatus:
            '201',

          successDescription:
            'Patient alert created',
        }),
    },

    '/patients/alerts/{alertId}/resolve': {
      post:
        mutationOperation({
          tag:
            'Patient Profile',

          summary:
            'Resolve a patient alert',

          schemaName:
            'ResolvePatientAlertRequest',

          parameters: [
            alertIdParameter,
          ],

          successDescription:
            'Patient alert resolved',
        }),
    },

    '/patients/{patientId}/duplicate-review': {
      post:
        mutationOperation({
          tag:
            'Patient Merge',

          summary:
            'Resolve duplicate-review status',

          schemaName:
            'DuplicateReviewResolutionRequest',

          parameters: [
            patientIdParameter,
          ],

          successDescription:
            'Duplicate-review status resolved',
        }),
    },

    '/patients/{patientId}/merge': {
      post:
        mutationOperation({
          tag:
            'Patient Merge',

          summary:
            'Merge a duplicate patient into a canonical patient',

          description:
            'Restricted to patients.merge. The source MRN remains in immutable merge history and all future reads resolve to the canonical target.',

          schemaName:
            'MergePatientsRequest',

          parameters: [
            patientIdParameter,
          ],

          successDescription:
            'Patient merge completed',
        }),
    },

    '/patients/merges/{mergeId}': {
      get:
        readOperation({
          tag:
            'Patient Merge',

          summary:
            'Read immutable patient merge history',

          description:
            'Restricted to patients.merge and returns the documented reason, evidence, actor, correlation ID, and source/target version transitions.',

          parameters: [
            mergeIdParameter,
          ],

          successDescription:
            'Patient merge history returned',
        }),
    },

    '/guardians': {
      get:
        readOperation({
          tag:
            'Guardians',

          summary:
            'Search guardians',

          description:
            'Search by guardian name, CNIC, phone, or enterprise guardian identifier.',

          sensitive:
            true,

          parameters: [
            {
              name:
                'term',

              in:
                'query',

              schema: {
                type:
                  'string',

                minLength:
                  2,

                example:
                  '35202-1111111-5',
              },
            },
            {
              name:
                'page',

              in:
                'query',

              schema: {
                type:
                  'integer',

                minimum:
                  1,

                default:
                  1,
              },
            },
          ],

          successDescription:
            'Guardian search page returned',
        }),
    },

    '/guardians/{guardianId}': {
      get:
        readOperation({
          tag:
            'Guardians',

          summary:
            'Get guardian profile',

          sensitive:
            true,

          parameters: [
            guardianIdParameter,
          ],

          successDescription:
            'Guardian profile returned',
        }),

      patch:
        mutationOperation({
          tag:
            'Guardians',

          summary:
            'Update guardian identity or contact information',

          schemaName:
            'GuardianUpdateRequest',

          parameters: [
            guardianIdParameter,
          ],

          successDescription:
            'Guardian updated',
        }),
    },
  },
} as const;

export const patientOpenApiExamples = {
  facilityId:
    facilityIdExample,

  patientId:
    patientIdExample,

  guardianId:
    guardianIdExample,

  mergeId:
    mergeIdExample,
} as const;
import mongoose, {
  Schema,
} from 'mongoose';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  accessControlSchemas,
} from './access-control.js';

import {
  auditSchemas,
} from './audit.js';

import {
  authSchemas,
} from './auth.js';

import {
  criticalSchemas,
} from './critical.js';

import {
  facilityConfigurationSchemas,
} from './facility-configuration.js';

import {
  guardianSchema,
} from './guardian.model.js';

import {
  patientGuardianSchema,
} from './patient-guardian.model.js';

import {
  patientIdentifierSchema,
} from './patient-identifier.model.js';

import {
  patientSchema,
} from './patient.model.js';

import {
  patientMergeSchema,
} from './patient-merge.model.js';

import {
  patientAddressSchema,
  patientAlertSchema,
  patientContactSchema,
} from './patient-profile.model.js';

import {
  opdClinicSchema,
  servicePointSchema,
} from './opd-context.model.js';

import {
  opdVisitSchema,
} from './opd-visit.model.js';

import {
  queueDefinitionSchema,
  queueStatusHistorySchema,
  queueTokenSchema,
  serviceCounterSchema,
} from './queue.model.js';

import {
  registrationSchema,
} from './registration.model.js';

import {
  commonFields,
} from './common.js';

export const patientGuardianSchemas = {
  patients:
    patientSchema,

  patientIdentifiers:
    patientIdentifierSchema,

  guardians:
    guardianSchema,

  patientGuardians:
    patientGuardianSchema,

  patientContacts:
    patientContactSchema,

  patientAddresses:
    patientAddressSchema,

  patientAlerts:
    patientAlertSchema,

  patientMerges:
    patientMergeSchema,
} as const;

export const registrationQueueSchemas = {
  opdClinics:
    opdClinicSchema,

  servicePoints:
    servicePointSchema,

  serviceCounters:
    serviceCounterSchema,

  registrations:
    registrationSchema,

  opdVisits:
    opdVisitSchema,

  queueDefinitions:
    queueDefinitionSchema,

  queueTokens:
    queueTokenSchema,

  queueStatusHistories:
    queueStatusHistorySchema,
} as const;

function specFor(
  name: HospitalCollectionName,
) {
  const spec =
    collectionSpecs.find(
      (candidate) =>
        candidate.name === name,
    );

  if (
    spec === undefined
  ) {
    throw new Error(
      `Collection specification not found for ${name}`,
    );
  }

  return spec;
}

export function schemaForCollection(
  name: HospitalCollectionName,
): Schema {
  const audit =
    auditSchemas[
      name as keyof typeof auditSchemas
    ];

  if (
    audit !== undefined
  ) {
    return audit;
  }

  const accessControl =
    accessControlSchemas[
      name as keyof typeof accessControlSchemas
    ];

  if (
    accessControl !== undefined
  ) {
    return accessControl;
  }

  const auth =
    authSchemas[
      name as keyof typeof authSchemas
    ];

  if (
    auth !== undefined
  ) {
    return auth;
  }

  const facilityConfiguration =
    facilityConfigurationSchemas[
      name as keyof typeof facilityConfigurationSchemas
    ];

  if (
    facilityConfiguration !==
    undefined
  ) {
    return facilityConfiguration;
  }

  const patientGuardian =
    patientGuardianSchemas[
      name as keyof typeof patientGuardianSchemas
    ];

  if (
    patientGuardian !== undefined
  ) {
    return patientGuardian;
  }

  const registrationQueue =
    registrationQueueSchemas[
      name as keyof typeof registrationQueueSchemas
    ];

  if (
    registrationQueue !== undefined
  ) {
    return registrationQueue;
  }

  const critical =
    criticalSchemas[
      name as keyof typeof criticalSchemas
    ];

  if (
    critical !== undefined
  ) {
    return critical;
  }

  const common =
    specFor(name).facilityScoped
      ? commonFields
      : Object.fromEntries(
          Object.entries(
            commonFields,
          ).filter(
            ([key]) =>
              key !==
              'facilityId',
          ),
        );

  const schema =
    new Schema(
      {
        ...common,

        data: {
          type:
            Schema.Types.Mixed,

          required:
            true,

          default:
            {},
        },
      },

      {
        collection:
          name,

        strict:
          true,

        versionKey:
          false,
      },
    );

  if (
    specFor(name).facilityScoped
  ) {
    schema.index({
      facilityId:
        1,

      createdAt:
        -1,
    });
  } else {
    schema.index({
      createdAt:
        -1,
    });
  }

  return schema;
}

export function registerAllModels(
  connection:
    mongoose.Connection =
      mongoose.connection,
) {
  return Object.fromEntries(
    collectionSpecs.map(
      (spec) => [
        spec.name,

        connection.models[
          spec.name
        ] ??
          connection.model(
            spec.name,

            schemaForCollection(
              spec.name,
            ),

            spec.name,
          ),
      ],
    ),
  );
}
import type {
  Db,
} from 'mongodb';

import {
  initializeDatabase,
} from './001-initialize-database.js';

import {
  authenticationFoundation,
} from './002-authentication-foundation.js';

import {
  accessControlFoundation,
} from './003-access-control-foundation.js';

import {
  auditFoundation,
} from './004-audit-foundation.js';

import {
  operationalInfrastructure,
} from './005-operational-infrastructure.js';

import {
  identitySchemaAlignment,
} from './006-identity-schema-alignment.js';

import {
  identityRuntimeInfrastructure,
} from './007-identity-runtime-infrastructure.js';

import {
  facilityConfigurationFoundation,
} from './008-facility-configuration-foundation.js';

import {
  patientGuardianFoundation,
} from './009-patient-guardian-foundation.js';

import {
  patientMergeFoundation,
} from './010-patient-merge-foundation.js';

import {
  registrationOpdQueueFoundation,
} from './011-registration-opd-queue-foundation.js';

import {
  clinicalEncountersEmrFoundation,
} from './012-clinical-encounters-emr-foundation.js';

import {
  clinicalVitalSignsFoundation,
} from './013-clinical-vital-signs-foundation.js';

import {
  clinicalReferralsFoundation,
} from './014-clinical-referrals-foundation.js';

import {
  formularyPrescriptionsFoundation,
} from './015-formulary-prescriptions-foundation.js';

import {
  laboratoryFoundation,
} from './016-laboratory-foundation.js';

import {
  radiologyFoundation,
} from './017-radiology-foundation.js';

import {
  radiologyImagingOperations,
} from './018-radiology-imaging-operations.js';

import {
  radiologyReportingFoundation,
} from './019-radiology-reporting.js';

import {
  inpatientFoundation,
} from './020-inpatient-foundation.js';

import {
  inpatientNursingMigration,
} from './021-inpatient-nursing.js';

import {
  inpatientDischargeMigration,
} from './022-inpatient-discharge.js';
import {
  nursingMedicationFoundation,
} from './023-nursing-medication-foundation.js';

export const migrations = [
  initializeDatabase,
  authenticationFoundation,
  accessControlFoundation,
  auditFoundation,
  operationalInfrastructure,
  identitySchemaAlignment,
  identityRuntimeInfrastructure,
  facilityConfigurationFoundation,
  patientGuardianFoundation,
  patientMergeFoundation,
  registrationOpdQueueFoundation,
  clinicalEncountersEmrFoundation,
  clinicalVitalSignsFoundation,
  clinicalReferralsFoundation,
  formularyPrescriptionsFoundation,
  laboratoryFoundation,
  radiologyFoundation,
  radiologyImagingOperations,
  radiologyReportingFoundation,
  inpatientFoundation,
  inpatientNursingMigration,
  inpatientDischargeMigration,
] as const;

export async function runMigrations(
  database: Db,
): Promise<void> {
  await database
    .collection('_migrations')
    .createIndex(
      {
        id: 1,
      },
      {
        unique: true,
      },
    );

  const applied = new Set(
    (
      await database
        .collection('_migrations')
        .find({})
        .project({
          id: 1,
        })
        .toArray()
    ).map((record) =>
      String(record['id']),
    ),
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    await migration.up(database);

    await database
      .collection('_migrations')
      .insertOne({
        id: migration.id,
        description:
          migration.description,
        appliedAt: new Date(),
      });
  }
}

export {
  radiologyReportingCollections,
  radiologyReportingFoundation,
  radiologyReportingValidators,
} from './019-radiology-reporting.js';

export {
  inpatientFoundation,
  inpatientFoundationCollections,
  inpatientFoundationValidators,
} from './020-inpatient-foundation.js';

export * from './021-inpatient-nursing.js';
export * from './022-inpatient-discharge.js';
import type {
  Db,
  IndexDescription,
} from 'mongodb';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  CoverageBenefitBalanceModel,
  CoverageDeterminationModel,
  CoverageOperationalHistoryModel,
  CoverageUtilizationModel,
} from '../models/coverage-utilization.model.js';

import {
  DiagnosticPanelItemModel,
  DiagnosticPanelModel,
  DiagnosticPanelVersionModel,
} from '../models/diagnostic-panel.model.js';

import {
  PackageEnrollmentBalanceModel,
  PackageOperationalHistoryModel,
  TreatmentPackageVersionModel,
} from '../models/package-coverage-history.model.js';

import {
  PanelPlanModel,
  PanelProgramModel,
  PatientCoverageModel,
  PatientCoverageVerificationModel,
  PayerOrganizationModel,
  PreauthorizationModel,
} from '../models/payer-coverage.model.js';

import type {
  Migration,
} from './types.js';

export const panelsPackagesCoverageFoundationCollections = [
  'diagnosticPanels',
  'diagnosticPanelItems',
  'diagnosticPanelVersions',
  'payerOrganizations',
  'panelPrograms',
  'panelPlans',
  'patientCoverages',
  'patientCoverageVerifications',
  'preauthorizations',
  'treatmentPackageVersions',
  'packageEnrollmentBalances',
  'packageOperationalHistories',
  'coverageDeterminations',
  'coverageBenefitBalances',
  'coverageUtilizations',
  'coverageOperationalHistories',
] as const satisfies readonly HospitalCollectionName[];

type PpcCollection =
  (typeof panelsPackagesCoverageFoundationCollections)[number];

const models = {
  diagnosticPanels: DiagnosticPanelModel,
  diagnosticPanelItems: DiagnosticPanelItemModel,
  diagnosticPanelVersions: DiagnosticPanelVersionModel,
  payerOrganizations: PayerOrganizationModel,
  panelPrograms: PanelProgramModel,
  panelPlans: PanelPlanModel,
  patientCoverages: PatientCoverageModel,
  patientCoverageVerifications: PatientCoverageVerificationModel,
  preauthorizations: PreauthorizationModel,
  treatmentPackageVersions: TreatmentPackageVersionModel,
  packageEnrollmentBalances: PackageEnrollmentBalanceModel,
  packageOperationalHistories: PackageOperationalHistoryModel,
  coverageDeterminations: CoverageDeterminationModel,
  coverageBenefitBalances: CoverageBenefitBalanceModel,
  coverageUtilizations: CoverageUtilizationModel,
  coverageOperationalHistories: CoverageOperationalHistoryModel,
} as const;

function schemaValidator(
  required: readonly string[],
): Record<string, unknown> {
  return {
    $jsonSchema: {
      bsonType: 'object',
      required: [
        'facilityId',
        'transactionId',
        'correlationId',
        'schemaVersion',
        'version',
        'createdBy',
        'updatedBy',
        'createdAt',
        'updatedAt',
        ...required,
      ],
      properties: {
        facilityId: { bsonType: 'objectId' },
        transactionId: { bsonType: 'string' },
        correlationId: { bsonType: 'string' },
        schemaVersion: { bsonType: 'number', minimum: 1 },
        version: { bsonType: 'number', minimum: 0 },
        createdBy: { bsonType: 'objectId' },
        updatedBy: { bsonType: 'objectId' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  };
}

export const panelsPackagesCoverageFoundationValidators:
Readonly<Record<PpcCollection, Record<string, unknown>>> = {
  diagnosticPanels: schemaValidator([
    'panelCode',
    'name',
    'panelType',
    'priceListId',
    'fixedPrice',
    'currency',
    'effectiveFrom',
    'status',
    'currentVersion',
  ]),
  diagnosticPanelItems: schemaValidator([
    'diagnosticPanelId',
    'lineNumber',
    'chargeCatalogItemId',
    'quantity',
    'requiredComponent',
    'allocationAmount',
    'active',
  ]),
  diagnosticPanelVersions: schemaValidator([
    'diagnosticPanelId',
    'versionNumber',
    'snapshot',
    'itemSnapshots',
    'changeReason',
  ]),
  payerOrganizations: schemaValidator([
    'organizationCode',
    'name',
    'organizationType',
    'status',
    'active',
  ]),
  panelPrograms: schemaValidator([
    'payerOrganizationId',
    'programCode',
    'name',
    'programType',
    'effectiveFrom',
    'status',
  ]),
  panelPlans: schemaValidator([
    'payerOrganizationId',
    'planCode',
    'name',
    'deductibleAmount',
    'copaymentAmount',
    'coinsurancePercentage',
    'coveragePercentage',
    'rules',
    'effectiveFrom',
    'status',
    'currentVersion',
  ]),
  patientCoverages: schemaValidator([
    'coverageNumber',
    'patientId',
    'panelPlanId',
    'priority',
    'eligibleFrom',
    'status',
  ]),
  patientCoverageVerifications: schemaValidator([
    'patientCoverageId',
    'status',
    'verifiedFrom',
    'responseSnapshot',
    'reason',
  ]),
  preauthorizations: schemaValidator([
    'authorizationNumber',
    'patientCoverageId',
    'patientId',
    'chargeCatalogItemIds',
    'requestedAmount',
    'approvedAmount',
    'validFrom',
    'status',
    'supportingAttachmentIds',
  ]),
  treatmentPackageVersions: schemaValidator([
    'treatmentPackageId',
    'versionNumber',
    'packageSnapshot',
    'itemSnapshots',
    'changeReason',
  ]),
  packageEnrollmentBalances: schemaValidator([
    'packageEnrollmentId',
    'treatmentPackageItemId',
    'includedQuantity',
    'reservedQuantity',
    'consumedQuantity',
    'reversedQuantity',
    'includedAmount',
    'reservedAmount',
    'consumedAmount',
    'reversedAmount',
  ]),
  packageOperationalHistories: schemaValidator([
    'action',
    'entityType',
    'entityId',
    'patientId',
  ]),
  coverageDeterminations: schemaValidator([
    'operationKey',
    'determinationNumber',
    'patientId',
    'invoiceId',
    'coverageIds',
    'status',
    'asOf',
    'grossAmount',
    'packageAmount',
    'sponsorAmount',
    'patientAmount',
    'allocations',
  ]),
  coverageBenefitBalances: schemaValidator([
    'patientCoverageId',
    'panelPlanId',
    'ruleCode',
    'limitPeriod',
    'periodStart',
    'reservedQuantity',
    'consumedQuantity',
    'reversedQuantity',
    'reservedAmount',
    'consumedAmount',
    'reversedAmount',
  ]),
  coverageUtilizations: schemaValidator([
    'operationKey',
    'coverageDeterminationId',
    'coverageBenefitBalanceId',
    'patientCoverageId',
    'invoiceId',
    'invoiceLineId',
    'chargeCatalogItemId',
    'quantity',
    'sponsorAmount',
    'status',
  ]),
  coverageOperationalHistories: schemaValidator([
    'action',
    'entityType',
    'entityId',
  ]),
};

function indexesFor(
  collectionName: PpcCollection,
): readonly IndexDescription[] {
  const model = models[collectionName];

  return model.schema.indexes().map(([key, options]) => ({
    key,
    ...options,
  })) as readonly IndexDescription[];
}

export const panelsPackagesCoverageFoundation: Migration = {
  id: '033-panels-packages-coverage-foundation',
  description:
    'Creates diagnostic panels, payer coverage, package history, benefit balances, determinations, and utilization controls',

  async up(database: Db): Promise<void> {
    const existingCollections = new Set(
      (
        await database
          .listCollections({}, { nameOnly: true })
          .toArray()
      ).map((collection) => collection.name),
    );

    for (const collectionName of panelsPackagesCoverageFoundationCollections) {
      const validator =
        panelsPackagesCoverageFoundationValidators[collectionName];

      if (!existingCollections.has(collectionName)) {
        await database.createCollection(collectionName, {
          validator,
          validationLevel: 'strict',
          validationAction: 'error',
        });
      } else {
        await database.command({
          collMod: collectionName,
          validator,
          validationLevel: 'strict',
          validationAction: 'error',
        });
      }

      const indexes = indexesFor(collectionName);

      if (indexes.length > 0) {
        await database.collection(collectionName).createIndexes(indexes);
      }
    }

    for (const collectionName of [
      'treatmentPackages',
      'treatmentPackageItems',
      'packageEnrollments',
      'packageUtilizations',
    ] as const) {
      const spec = collectionSpecs.find(
        (candidate) => candidate.name === collectionName,
      );

      if (spec === undefined) {
        throw new Error(
          `Missing collection specification for ${collectionName}`,
        );
      }
    }
  },

  async down(database: Db): Promise<void> {
    for (
      const collectionName of
      [...panelsPackagesCoverageFoundationCollections].reverse()
    ) {
      await database
        .collection(collectionName)
        .drop()
        .catch(() => undefined);
    }
  },
};
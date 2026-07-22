import mongoose from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  collectionSpecs,
} from '../catalog/collection-specs.js';

import {
  coverageDeterminationSchema,
  coverageOperationalHistorySchema,
} from '../models/coverage-utilization.model.js';

import {
  diagnosticPanelSchema,
  diagnosticPanelVersionSchema,
} from '../models/diagnostic-panel.model.js';

import {
  packageEnrollmentBalanceSchema,
  treatmentPackageVersionSchema,
} from '../models/package-coverage-history.model.js';

import {
  panelPlanSchema,
  patientCoverageSchema,
} from '../models/payer-coverage.model.js';

import {
  treatmentPackageItemSchema,
  treatmentPackageSchema,
} from '../models/billing-pricing-package.model.js';

import {
  panelsPackagesCoverageSchemas,
  schemaForCollection,
} from '../models/registry.js';

import {
  panelsPackagesCoverageFoundation,
  panelsPackagesCoverageFoundationCollections,
  panelsPackagesCoverageFoundationValidators,
} from '../migrations/033-panels-packages-coverage-foundation.js';

import {
  migrations,
} from '../migrations/index.js';

function indexNames(schema: mongoose.Schema): string[] {
  return schema.indexes().flatMap(([, options]) =>
    typeof options.name === 'string' ? [options.name] : [],
  );
}

describe('panels packages coverage database foundation', () => {
  it('registers migration 033 after payment controls', () => {
    expect(migrations.at(-1)).toBe(panelsPackagesCoverageFoundation);
  });

  it('registers every new collection specification and validator', () => {
    const registered = new Set(collectionSpecs.map((spec) => spec.name));

    for (const collectionName of panelsPackagesCoverageFoundationCollections) {
      expect(registered.has(collectionName)).toBe(true);
      expect(
        panelsPackagesCoverageFoundationValidators[collectionName],
      ).toBeDefined();
      expect(schemaForCollection(collectionName)).toBe(
        panelsPackagesCoverageSchemas[collectionName],
      );
    }
  });

  it('keeps version and operational history collections immutable', () => {
    const retentionByName = new Map(
      collectionSpecs.map((spec) => [spec.name, spec.retention]),
    );

    expect(retentionByName.get('diagnosticPanelVersions')).toBe(
      'immutable',
    );
    expect(retentionByName.get('treatmentPackageVersions')).toBe(
      'immutable',
    );
    expect(retentionByName.get('coverageOperationalHistories')).toBe(
      'immutable',
    );
  });

  it('defines facility-scoped unique panel codes and versions', () => {
    expect(indexNames(diagnosticPanelSchema)).toContain(
      'uq_diagnostic_panels_facility_code',
    );
    expect(indexNames(diagnosticPanelVersionSchema)).toContain(
      'uq_diagnostic_panel_versions_number',
    );
  });

  it('protects sensitive membership references from default queries', () => {
    expect(
      patientCoverageSchema.path('membershipReferenceEncrypted').options
        .select,
    ).toBe(false);
    expect(
      patientCoverageSchema.path('membershipReferenceHash').options
        .select,
    ).toBe(false);
  });

  it('supports coordinated coverage and idempotent determinations', () => {
    expect(indexNames(coverageDeterminationSchema)).toContain(
      'uq_coverage_determinations_operation',
    );
    expect(
      coverageDeterminationSchema.path('coverageIds'),
    ).toBeDefined();
  });

  it('extends Module 13 packages rather than duplicating them', () => {
    expect(treatmentPackageSchema.path('pricingMode')).toBeDefined();
    expect(
      treatmentPackageSchema.path('discountPercentage'),
    ).toBeDefined();
    expect(treatmentPackageSchema.path('eligibility')).toBeDefined();
    expect(treatmentPackageItemSchema.path('included')).toBeDefined();
    expect(
      treatmentPackageItemSchema.path('requiresAuthorization'),
    ).toBeDefined();
  });

  it('defines transactional package and benefit balance indexes', () => {
    expect(indexNames(packageEnrollmentBalanceSchema)).toContain(
      'uq_package_enrollment_balances_item',
    );
    expect(indexNames(panelPlanSchema)).toContain(
      'uq_panel_plans_payer_code',
    );
  });

  it('provides immutable snapshots for package and coverage history', () => {
    expect(
      treatmentPackageVersionSchema.path('packageSnapshot').options
        .immutable,
    ).toBe(true);
    expect(
      coverageOperationalHistorySchema.path('afterSnapshot').options
        .immutable,
    ).toBe(true);
  });
});
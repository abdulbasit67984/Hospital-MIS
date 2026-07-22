import {
  decimal128ToString,
} from '@hospital-mis/database';

import type {
  CoverageDeterminationView,
  CoverageLineAllocationView,
} from './panels-packages-coverage.contracts.js';

import type {
  CoverageAllocationRecord,
  CoverageDeterminationRecord,
} from './panels-packages-coverage.persistence.types.js';

function objectId(value: Readonly<{ toHexString(): string }>): string {
  return value.toHexString();
}

function decimal(
  value: Parameters<typeof decimal128ToString>[0],
): string {
  return decimal128ToString(value);
}

export function projectCoverageAllocation(
  record: CoverageAllocationRecord,
): CoverageLineAllocationView {
  return {
    invoiceLineId: objectId(record.invoiceLineId),
    coverageId:
      record.patientCoverageId === null
        ? null
        : objectId(record.patientCoverageId),
    packageEnrollmentId:
      record.packageEnrollmentId === null
        ? null
        : objectId(record.packageEnrollmentId),
    grossAmount: decimal(record.grossAmount),
    packageAmount: decimal(record.packageAmount),
    deductibleAmount: decimal(record.deductibleAmount),
    copaymentAmount: decimal(record.copaymentAmount),
    coinsuranceAmount: decimal(record.coinsuranceAmount),
    sponsorAmount: decimal(record.sponsorAmount),
    patientAmount: decimal(record.patientAmount),
    deniedAmount: decimal(record.deniedAmount),
    denialReason: record.denialReason,
  };
}

export function projectCoverageDetermination(
  record: CoverageDeterminationRecord,
): CoverageDeterminationView {
  return {
    id: objectId(record._id),
    facilityId: objectId(record.facilityId),
    patientId: objectId(record.patientId),
    invoiceId: objectId(record.invoiceId),
    status: record.status,
    grossAmount: decimal(record.grossAmount),
    packageAmount: decimal(record.packageAmount),
    sponsorAmount: decimal(record.sponsorAmount),
    patientAmount: decimal(record.patientAmount),
    lines: record.allocations.map(projectCoverageAllocation),
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
import type {
  CoverageMasterService,
} from './services/coverage-master.service.js';

import type {
  CoverageDeterminationService,
} from './services/coverage-determination.service.js';

import type {
  CoverageFinancialControlService,
} from './services/coverage-financial-control.service.js';

import type {
  CoverageVerificationService,
} from './services/coverage-verification.service.js';

import type {
  DiagnosticPanelService,
} from './services/diagnostic-panel.service.js';

import type {
  PackageEnrollmentService,
} from './services/package-enrollment.service.js';

import type {
  PanelsPackagesCoverageRecoveryService,
} from './services/panels-packages-coverage-recovery.service.js';

import type {
  PanelsPackagesCoverageReportService,
} from './services/panels-packages-coverage-report.service.js';

export interface PanelsPackagesCoverageApplication {
  readonly services: Readonly<{
    panels: DiagnosticPanelService;
    coverageMaster: CoverageMasterService;
    packages: PackageEnrollmentService;
    verification: CoverageVerificationService;
    determinations: CoverageDeterminationService;
    financialControls: CoverageFinancialControlService;
    reports: PanelsPackagesCoverageReportService;
    recovery: PanelsPackagesCoverageRecoveryService;
  }>;
}

export function createPanelsPackagesCoverageApplication(
  services: PanelsPackagesCoverageApplication['services'],
): PanelsPackagesCoverageApplication {
  return {
    services: Object.freeze({
      ...services,
    }),
  };
}
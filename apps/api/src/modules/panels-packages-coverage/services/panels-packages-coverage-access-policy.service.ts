import {
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS,
} from '../panels-packages-coverage.constants.js';

import {
  PpcMakerCheckerViolationError,
} from '../panels-packages-coverage.errors.js';

import type {
  PpcAccessPolicyPort,
} from '../panels-packages-coverage.ports.js';

const sensitivePermissions = new Set<string>([
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PANEL_ACTIVATE,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PACKAGE_ACTIVATE,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PACKAGE_CANCEL,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.PACKAGE_REVERSE,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_ACTIVATE,
  PANELS_PACKAGES_COVERAGE_PERMISSION_KEYS.COVERAGE_OVERRIDE,
]);

export class PanelsPackagesCoverageAccessPolicyService
implements PpcAccessPolicyPort {
  public async authorize(
    input: Parameters<PpcAccessPolicyPort['authorize']>[0],
  ) {
    const hasPermission =
      input.actor.permissionKeys.includes(input.permission);

    if (!hasPermission) {
      return {
        allowed: false,
        denialReason: `Missing permission ${input.permission}`,
      };
    }

    if (
      sensitivePermissions.has(input.permission) &&
      input.actor.roleKeys.includes('BREAK_GLASS')
    ) {
      return {
        allowed: false,
        denialReason:
          'Break-glass access cannot approve or override financial coverage operations',
      };
    }

    return {
      allowed: true,
      denialReason: null,
    };
  }

  public assertIndependentChecker(
    makerUserId: string,
    checkerUserId: string,
  ): void {
    if (makerUserId === checkerUserId) {
      throw new PpcMakerCheckerViolationError();
    }
  }
import type {
  PharmacyDispensingActorContext,
  PharmacyReviewAlertDecisionInput,
  PharmacySafetyEvaluationRequest,
  PharmacySafetyFinding,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyPrescriptionRepositoryPort,
  PharmacySafetyPort,
} from '../pharmacy-dispensing.ports.js';

import type {
  PharmacyPrescriptionWarningRecord,
} from '../pharmacy-dispensing.persistence.types.js';

export interface PharmacySafetyEvaluation {
  findings: readonly PharmacySafetyFinding[];
  blockingCount: number;
}

function normalizedWarningType(
  warningType: string,
): PharmacySafetyFinding['type'] {
  switch (warningType) {
    case 'ALLERGY':
      return 'ALLERGY';
    case 'INTERACTION':
      return 'INTERACTION';
    case 'DUPLICATE_ACTIVE_MEDICINE':
    case 'DUPLICATE_THERAPY':
      return 'DUPLICATE_THERAPY';
    case 'CONTRAINDICATION':
      return 'CONTRAINDICATION';
    case 'DOSE_RANGE':
      return 'DOSE_RANGE';
    case 'ROUTE':
      return 'ROUTE';
    case 'FREQUENCY':
      return 'FREQUENCY';
    case 'AGE':
      return 'AGE';
    case 'WEIGHT':
      return 'WEIGHT';
    case 'PREGNANCY':
      return 'PREGNANCY';
    case 'RENAL':
      return 'RENAL';
    case 'HEPATIC':
      return 'HEPATIC';
    default:
      return 'OTHER';
  }
}

function normalizedSeverity(
  severity: string,
): PharmacySafetyFinding['severity'] {
  switch (severity) {
    case 'INFO':
      return 'INFO';
    case 'LOW':
      return 'LOW';
    case 'MODERATE':
    case 'WARNING':
      return 'MODERATE';
    case 'HIGH':
    case 'CRITICAL':
      return 'HIGH';
    case 'BLOCKING':
    case 'CONTRAINDICATED':
      return 'CONTRAINDICATED';
    default:
      return 'MODERATE';
  }
}

function warningFinding(
  warning: PharmacyPrescriptionWarningRecord,
): PharmacySafetyFinding {
  const severity =
    normalizedSeverity(warning.severity);
  const acknowledged =
    warning.status === 'ACKNOWLEDGED' ||
    warning.status === 'RESOLVED';

  return {
    fingerprint:
      warning._id.toHexString(),
    type:
      normalizedWarningType(
        warning.warningType,
      ),
    severity,
    disposition:
      acknowledged
        ? 'ACKNOWLEDGED'
        : severity === 'HIGH' ||
            severity === 'CONTRAINDICATED'
          ? 'BLOCKING'
          : 'OPEN',
    code:
      warning.warningCode,
    message:
      warning.message,
    prescriptionItemId:
      warning.prescriptionItemId?.toHexString() ??
      null,
    sourceEntityType:
      'PRESCRIPTION_SAFETY_WARNING',
    sourceEntityId:
      warning._id.toHexString(),
  };
}

function deduplicate(
  findings: readonly PharmacySafetyFinding[],
): PharmacySafetyFinding[] {
  const records = new Map<
    string,
    PharmacySafetyFinding
  >();

  for (const finding of findings) {
    const current =
      records.get(finding.fingerprint);

    if (current === undefined) {
      records.set(
        finding.fingerprint,
        finding,
      );
      continue;
    }

    const severityOrder = [
      'INFO',
      'LOW',
      'MODERATE',
      'HIGH',
      'CONTRAINDICATED',
    ];

    if (
      severityOrder.indexOf(finding.severity) >
      severityOrder.indexOf(current.severity)
    ) {
      records.set(
        finding.fingerprint,
        finding,
      );
    }
  }

  return [...records.values()];
}

export class PharmacySafetyService {
  public constructor(
    private readonly prescriptions:
      PharmacyPrescriptionRepositoryPort,
    private readonly externalSafety:
      PharmacySafetyPort,
  ) {}

  public async evaluate(
    actor: PharmacyDispensingActorContext,
    request: PharmacySafetyEvaluationRequest,
  ): Promise<PharmacySafetyEvaluation> {
    const [prescriptionWarnings, externalFindings] =
      await Promise.all([
        this.prescriptions.listPrescriptionWarnings(
          actor.facilityId,
          request.prescriptionId,
        ),
        this.externalSafety.evaluate(request),
      ]);

    const findings = deduplicate([
      ...prescriptionWarnings.map(
        warningFinding,
      ),
      ...externalFindings,
    ]);

    return {
      findings,
      blockingCount:
        findings.filter(
          (finding) =>
            finding.disposition ===
            'BLOCKING',
        ).length,
    };
  }

  public applyDecisions(
    evaluation: PharmacySafetyEvaluation,
    decisions:
      readonly PharmacyReviewAlertDecisionInput[],
  ): PharmacySafetyEvaluation {
    const decisionsByFingerprint =
      new Map(
        decisions.map((decision) => [
          decision.alertFingerprint,
          decision,
        ]),
      );

    const findings =
      evaluation.findings.map((finding) => {
        const decision =
          decisionsByFingerprint.get(
            finding.fingerprint,
          );

        if (decision === undefined) {
          return finding;
        }

        return {
          ...finding,
          disposition:
            decision.disposition,
        };
      });

    return {
      findings,
      blockingCount:
        findings.filter(
          (finding) =>
            finding.disposition ===
            'BLOCKING',
        ).length,
    };
  }
}
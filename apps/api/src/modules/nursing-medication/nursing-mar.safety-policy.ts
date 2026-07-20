import type {
  MedicationAdministrationSafetyConfiguration,
  MedicationAdministrationSafetyFinding,
  MedicationAdministrationSafetyResult,
} from './nursing-mar.contracts.js';

import type {
  MedicationAdministrationSafetyRequest,
  NursingMedicationSafetyPolicyPort,
} from './nursing-mar.ports.js';

function decimalNumber(
  value: string,
): number {
  return Number(value);
}

function withinDoseVariance(
  prescribedDose: string,
  administeredDose: string,
  variancePercent: number,
): boolean {
  const prescribed =
    decimalNumber(
      prescribedDose,
    );

  const administered =
    decimalNumber(
      administeredDose,
    );

  if (
    !Number.isFinite(
      prescribed,
    ) ||
    !Number.isFinite(
      administered,
    ) ||
    prescribed <= 0 ||
    administered <= 0
  ) {
    return false;
  }

  const variance =
    Math.abs(
      administered - prescribed,
    ) /
    prescribed *
    100;

  return variance <=
    variancePercent;
}

function finding(
  code: string,
  severity: MedicationAdministrationSafetyFinding['severity'],
  message: string,
): MedicationAdministrationSafetyFinding {
  return {
    code,
    severity,
    message,
  };
}

export class DefaultNursingMedicationSafetyPolicy
implements NursingMedicationSafetyPolicyPort {
  public constructor(
    private readonly configurationReader?: Readonly<{
      find(
        facilityId: string,
        wardId: string,
      ): Promise<
        MedicationAdministrationSafetyConfiguration |
        null
      >;
    }>,
  ) {}

  public async configuration(
    facilityId: string,
    wardId: string,
  ): Promise<MedicationAdministrationSafetyConfiguration> {
    const configured =
      await this.configurationReader
        ?.find(
          facilityId,
          wardId,
        );

    return configured ?? {
      earlyWindowMinutes:
        30,

      lateWindowMinutes:
        60,

      doseVariancePercent:
        0,

      requireDispensationTraceForStockTracked:
        true,

      blockOpenHighWarnings:
        true,

      blockOpenContraindicatedWarnings:
        true,
    };
  }

  public evaluate(
    configuration:
      MedicationAdministrationSafetyConfiguration,

    request:
      MedicationAdministrationSafetyRequest,
  ): MedicationAdministrationSafetyResult {
    const findings:
      MedicationAdministrationSafetyFinding[] = [];

    const rightPatient =
      request.schedule.patientId.toHexString() ===
        request.context.patient.patientId &&
      request.schedule.admissionId.toHexString() ===
        request.context.admissionId;

    if (
      !rightPatient
    ) {
      findings.push(
        finding(
          'WRONG_PATIENT',
          'BLOCKING',
          'The medication schedule does not belong to the resolved patient and admission',
        ),
      );
    }

    const rightMedicine =
      request.orderTrace ===
        null ||
      (
        request.orderTrace.medicineId ===
          request.schedule.medicineId.toHexString() &&
        request.orderTrace.formularyItemId ===
          request.schedule.formularyItemId?.toHexString()
      );

    if (
      !rightMedicine
    ) {
      findings.push(
        finding(
          'WRONG_MEDICINE',
          'BLOCKING',
          'The scheduled medicine no longer matches its prescription item',
        ),
      );
    }

    const prescribedDose =
      request.schedule.prescribedDose.toString();

    const rightDose =
      withinDoseVariance(
        prescribedDose,
        request.administeredDose,
        configuration.doseVariancePercent,
      );

    if (
      !rightDose
    ) {
      findings.push(
        finding(
          'DOSE_MISMATCH',
          'BLOCKING',
          'The administered dose does not match the prescribed dose within the configured variance',
        ),
      );
    }

    const rightRoute =
      request.administeredRoute ===
      request.schedule.route;

    if (
      !rightRoute
    ) {
      findings.push(
        finding(
          'ROUTE_MISMATCH',
          'BLOCKING',
          'The administered route does not match the prescribed route',
        ),
      );
    }

    const earliest =
      request.scheduledAt.getTime() -
      configuration.earlyWindowMinutes *
        60 *
        1_000;

    const latest =
      request.scheduledAt.getTime() +
      configuration.lateWindowMinutes *
        60 *
        1_000;

    const administrationTime =
      request.administeredAt.getTime();

    const rightTime =
      administrationTime >= earliest &&
      administrationTime <= latest;

    if (
      !rightTime
    ) {
      findings.push(
        finding(
          'OUTSIDE_ADMINISTRATION_WINDOW',
          'BLOCKING',
          'The administration time is outside the configured early and late dose window',
        ),
      );
    }

    const orderActive =
      request.orderTrace ===
        null ||
      (
        [
          'ISSUED',
          'PARTIALLY_DISPENSED',
          'DISPENSED',
        ].includes(
          request.orderTrace.prescriptionStatus,
        ) &&
        request.orderTrace.prescriptionItemStatus ===
          'ACTIVE'
      );

    if (
      !orderActive
    ) {
      findings.push(
        finding(
          'ORDER_NOT_ACTIVE',
          'BLOCKING',
          'The prescription or prescription item is no longer active',
        ),
      );
    }

    const dispensationTraceSatisfied =
      request.orderTrace ===
        null ||
      !request.orderTrace.stockTracked ||
      !configuration.requireDispensationTraceForStockTracked ||
      (
        Number(
          request.orderTrace.dispensedQuantity,
        ) > 0 &&
        request.orderTrace.lastDispensationId !==
          null
      );

    if (
      !dispensationTraceSatisfied
    ) {
      findings.push(
        finding(
          'DISPENSATION_TRACE_MISSING',
          'BLOCKING',
          'A stock-tracked prescription item requires successful pharmacy dispensation before administration',
        ),
      );
    }

    if (
      request.orderTrace !==
      null
    ) {
      for (
        const warning of
        request.orderTrace.openWarnings
      ) {
        const blocking =
          warning.status ===
            'OPEN' &&
          (
            (
              warning.severity ===
                'CONTRAINDICATED' &&
              configuration.blockOpenContraindicatedWarnings
            ) ||
            (
              warning.severity ===
                'HIGH' &&
              configuration.blockOpenHighWarnings
            )
          );

        findings.push(
          finding(
            `PRESCRIPTION_WARNING_${warning.warningCode}`,
            blocking
              ? 'BLOCKING'
              : 'WARNING',
            warning.message,
          ),
        );
      }

      if (
        request.orderTrace.highAlert
      ) {
        findings.push(
          finding(
            'HIGH_ALERT_MEDICATION',
            'WARNING',
            'This formulary item is classified as high alert',
          ),
        );
      }

      if (
        request.orderTrace.controlledMedicine
      ) {
        findings.push(
          finding(
            'CONTROLLED_MEDICATION',
            'WARNING',
            'This formulary item is classified as a controlled medicine',
          ),
        );
      }
    }

    return {
      allowed:
        findings.every(
          (item) =>
            item.severity !==
            'BLOCKING',
        ),

      rightPatient,

      rightMedicine,

      rightDose,

      rightRoute,

      rightTime,

      orderActive,

      dispensationTraceSatisfied,

      findings,
    };
  }
}
import {
  PatientAllergyModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PrescriptionWarningSeverity,
} from '@hospital-mis/database';

import type {
  MedicineInteractionPort,
  PrescriptionSafetyEvaluationPort,
  PrescriptionSafetyEvaluationRequest,
  PrescriptionSafetyFinding,
} from '../formulary-prescriptions.ports.js';

import {
  buildPrescriptionWarningFingerprint,
  normalizeFormularyText,
} from '../formulary-prescriptions.normalization.js';

import {
  PrescriptionRepository,
} from '../repositories/prescription.repository.js';

interface ActivePatientAllergy {
  _id: {
    toHexString(): string;
  };

  allergyId: {
    toHexString(): string;
  } | null;

  category: string;
  allergenText: string;
  normalizedAllergenText: string;
  severity: string;
  verificationStatus: string;
}

function allergyWarningSeverity(
  severity: string,
): PrescriptionWarningSeverity {
  switch (severity) {
    case 'LIFE_THREATENING':
      return 'CONTRAINDICATED';

    case 'SEVERE':
      return 'HIGH';

    case 'MODERATE':
      return 'MODERATE';

    case 'MILD':
      return 'LOW';

    default:
      return 'MODERATE';
  }
}

function medicineTerms(
  input: Readonly<{
    genericName: string;
    selectedBrandName: string | null;
  }>,
): Set<string> {
  const terms =
    new Set<string>();

  terms.add(
    normalizeFormularyText(
      input.genericName,
    ),
  );

  if (
    input.selectedBrandName !== null
  ) {
    terms.add(
      normalizeFormularyText(
        input.selectedBrandName,
      ),
    );
  }

  return terms;
}

function allergyMatchesMedicine(
  allergy: ActivePatientAllergy,
  terms: ReadonlySet<string>,
): boolean {
  if (
    allergy.category !== 'MEDICATION' ||
    allergy.verificationStatus ===
      'REFUTED'
  ) {
    return false;
  }

  const allergen =
    normalizeFormularyText(
      allergy.normalizedAllergenText ||
      allergy.allergenText,
    );

  for (const term of terms) {
    if (
      allergen === term ||
      allergen.includes(term) ||
      term.includes(allergen)
    ) {
      return true;
    }
  }

  return false;
}

export class PrescriptionSafetyService
implements PrescriptionSafetyEvaluationPort {
  public constructor(
    private readonly prescriptions:
      PrescriptionRepository,

    private readonly interactions:
      MedicineInteractionPort | null =
        null,
  ) {}

  public async evaluate(
    request:
      PrescriptionSafetyEvaluationRequest,
  ): Promise<readonly PrescriptionSafetyFinding[]> {
    const allergies =
      await PatientAllergyModel.find({
        facilityId:
          toObjectId(
            request.actor.facilityId,
            'facilityId',
          ),

        patientId:
          toObjectId(
            request.context.patientId,
            'patientId',
          ),

        status:
          'ACTIVE',

        recordType:
          'ALLERGY',
      })
        .select(
          [
            '_id',
            'allergyId',
            'category',
            'allergenText',
            'normalizedAllergenText',
            'severity',
            'verificationStatus',
          ].join(' '),
        )
        .lean<ActivePatientAllergy[]>()
        .exec();

    const medicineIds =
      [
        ...new Set(
          request.items.map(
            (item) =>
              item.medicineId.toHexString(),
          ),
        ),
      ];

    const activeMedicineItems =
      await this.prescriptions
        .listActivePatientMedicineItems(
          request.actor.facilityId,
          request.context.patientId,
          medicineIds,
        );

    const findings:
      PrescriptionSafetyFinding[] = [];

    for (const item of request.items) {
      const prescriptionItemId =
        item._id.toHexString();

      const terms =
        medicineTerms({
          genericName:
            item.genericNameSnapshot,

          selectedBrandName:
            item.selectedBrandName,
        });

      for (const allergy of allergies) {
        if (
          !allergyMatchesMedicine(
            allergy,
            terms,
          )
        ) {
          continue;
        }

        const finding = {
          prescriptionItemId,

          warningType:
            'ALLERGY' as const,

          severity:
            allergyWarningSeverity(
              allergy.severity,
            ),

          warningCode:
            'ACTIVE_MEDICATION_ALLERGY_MATCH',

          message:
            'The selected medicine may conflict with an active medication allergy',

          patientAllergyId:
            allergy._id.toHexString(),

          conflictingPrescriptionId:
            null,

          conflictingPrescriptionItemId:
            null,

          externalReferenceId:
            allergy.allergyId?.toHexString() ??
            null,
        };

        findings.push({
          ...finding,

          warningFingerprint:
            buildPrescriptionWarningFingerprint({
              facilityId:
                request.actor.facilityId,

              prescriptionId:
                request.prescriptionId,

              prescriptionItemId,

              warningType:
                finding.warningType,

              warningCode:
                finding.warningCode,

              patientAllergyId:
                finding.patientAllergyId,

              externalReferenceId:
                finding.externalReferenceId,
            }),
        });
      }

      const duplicate =
        activeMedicineItems.find(
          (activeItem) =>
            activeItem.medicineId.toHexString() ===
              item.medicineId.toHexString() &&
            activeItem.prescriptionId.toHexString() !==
              request.prescriptionId,
        );

      if (duplicate !== undefined) {
        const finding = {
          prescriptionItemId,

          warningType:
            'DUPLICATE_ACTIVE_MEDICINE' as const,

          severity:
            'HIGH' as const,

          warningCode:
            'DUPLICATE_ACTIVE_MEDICINE',

          message:
            'The patient already has an active prescription for this medicine',

          patientAllergyId:
            null,

          conflictingPrescriptionId:
            duplicate.prescriptionId.toHexString(),

          conflictingPrescriptionItemId:
            duplicate._id.toHexString(),

          externalReferenceId:
            null,
        };

        findings.push({
          ...finding,

          warningFingerprint:
            buildPrescriptionWarningFingerprint({
              facilityId:
                request.actor.facilityId,

              prescriptionId:
                request.prescriptionId,

              prescriptionItemId,

              warningType:
                finding.warningType,

              warningCode:
                finding.warningCode,

              conflictingPrescriptionId:
                finding.conflictingPrescriptionId,

              conflictingPrescriptionItemId:
                finding.conflictingPrescriptionItemId,
            }),
        });
      }
    }

    if (
      this.interactions !== null &&
      medicineIds.length > 1
    ) {
      const interactionResult =
        await this.interactions.check(
          request.actor.facilityId,
          request.context.patientId,
          medicineIds,
        );

      findings.push(
        ...interactionResult.findings,
      );
    }

    return findings;
  }
}
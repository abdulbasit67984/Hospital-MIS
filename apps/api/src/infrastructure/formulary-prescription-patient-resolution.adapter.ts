import type {
  PatientStatus,
} from '@hospital-mis/database';

import {
  FormularyPrescriptionFacilityBoundaryError,
  PrescriptionClinicalContextMismatchError,
} from '../modules/formulary-prescriptions/formulary-prescriptions.errors.js';

import type {
  CanonicalFormularyPrescriptionPatientResolution,
  FormularyPrescriptionCanonicalPatientPort,
} from '../modules/formulary-prescriptions/formulary-prescriptions.ports.js';

import type {
  CanonicalPatientResolution,
} from '../modules/patient/patient.merge.js';

import {
  PatientCanonicalizationService,
  PatientMergeRepository,
} from '../modules/patient/repositories/patient-merge.repository.js';

export interface FormularyPrescriptionPatientCanonicalizationReader {
  resolve(
    facilityId:
      string,

    patientId:
      string,
  ): Promise<CanonicalPatientResolution>;
}

const prescribablePatientStatuses =
  new Set<PatientStatus>([
    'ACTIVE',
  ]);

export class FormularyPrescriptionPatientResolutionAdapter
implements FormularyPrescriptionCanonicalPatientPort {
  public constructor(
    private readonly canonicalization:
      FormularyPrescriptionPatientCanonicalizationReader =
        new PatientCanonicalizationService(
          new PatientMergeRepository(),
        ),
  ) {}

  public async resolve(
    facilityId:
      string,

    patientId:
      string,
  ): Promise<CanonicalFormularyPrescriptionPatientResolution> {
    let resolution:
      CanonicalPatientResolution;

    try {
      resolution =
        await this.canonicalization.resolve(
          facilityId,
          patientId,
        );
    } catch (error) {
      if (
        error instanceof
          Error &&
        error.message
          .toLocaleLowerCase(
            'en-US',
          )
          .includes(
            'not found',
          )
      ) {
        throw new FormularyPrescriptionFacilityBoundaryError();
      }

      throw error;
    }

    if (
      !prescribablePatientStatuses.has(
        resolution.canonicalStatus,
      )
    ) {
      throw new PrescriptionClinicalContextMismatchError(
        'The canonical patient is not active and cannot receive a new prescription',
      );
    }

    return {
      requestedPatientId:
        resolution.requestedPatientId,

      canonicalPatientId:
        resolution.canonicalPatientId,

      redirected:
        resolution.redirected,

      mergeChain:
        [
          ...resolution.redirectPath,
        ],
    };
  }
}
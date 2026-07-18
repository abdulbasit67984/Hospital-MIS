import type {
  PatientStatus,
} from '@hospital-mis/database';

import {
  CanonicalClinicalPatientUnavailableError,
  ClinicalEmrFacilityBoundaryError,
} from '../clinical-emr.errors.js';

import type {
  CanonicalClinicalPatientResolution,
  ClinicalEmrCanonicalPatientPort,
} from '../clinical-emr.ports.js';

import type {
  CanonicalPatientResolution,
} from '../../patient/patient.merge.js';

import {
  PatientCanonicalizationService,
  PatientMergeRepository,
} from '../../patient/repositories/patient-merge.repository.js';

export interface ClinicalPatientCanonicalizationReader {
  resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalPatientResolution>;
}

const clinicalDocumentableStatuses = new Set<PatientStatus>([
  'ACTIVE',
]);

export class ClinicalEmrPatientResolutionService
implements ClinicalEmrCanonicalPatientPort {
  public constructor(
    private readonly canonicalization: ClinicalPatientCanonicalizationReader =
      new PatientCanonicalizationService(
        new PatientMergeRepository(),
      ),
  ) {}

  public async resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalClinicalPatientResolution> {
    let resolution: CanonicalPatientResolution;

    try {
      resolution = await this.canonicalization.resolve(
        facilityId,
        patientId,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLocaleLowerCase('en-US').includes('not found')
      ) {
        throw new ClinicalEmrFacilityBoundaryError();
      }

      throw error;
    }

    if (!clinicalDocumentableStatuses.has(resolution.canonicalStatus)) {
      throw new CanonicalClinicalPatientUnavailableError();
    }

    return {
      requestedPatientId: resolution.requestedPatientId,
      canonicalPatientId: resolution.canonicalPatientId,
      redirected: resolution.redirected,
      mergeChain: [...resolution.redirectPath],
    };
  }
}
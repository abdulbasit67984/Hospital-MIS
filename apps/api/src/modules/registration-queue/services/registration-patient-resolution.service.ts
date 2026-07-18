import type {
  PatientStatus,
} from '@hospital-mis/database';

import {
  CanonicalPatientUnavailableError,
} from '../registration-queue.errors.js';

import type {
  RegistrationQueueCanonicalPatientPort,
} from '../registration-queue.ports.js';

import type {
  CanonicalPatientRegistrationResolution,
} from '../registration-queue.types.js';

import type {
  CanonicalPatientResolution,
} from '../../patient/patient.merge.js';

import {
  PatientCanonicalizationService,
  PatientMergeRepository,
} from '../../patient/repositories/patient-merge.repository.js';

export interface PatientCanonicalizationReader {
  resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalPatientResolution>;
}

const registerablePatientStatuses =
  new Set<PatientStatus>([
    'ACTIVE',
  ]);

export class RegistrationPatientResolutionService
implements RegistrationQueueCanonicalPatientPort {
  public constructor(
    private readonly canonicalization:
      PatientCanonicalizationReader =
        new PatientCanonicalizationService(
          new PatientMergeRepository(),
        ),
  ) {}

  public async resolve(
    facilityId: string,
    patientId: string,
  ): Promise<CanonicalPatientRegistrationResolution> {
    const resolution =
      await this.canonicalization.resolve(
        facilityId,
        patientId,
      );

    if (
      !registerablePatientStatuses.has(
        resolution.canonicalStatus,
      )
    ) {
      throw new CanonicalPatientUnavailableError();
    }

    return {
      requestedPatientId:
        resolution.requestedPatientId,

      canonicalPatientId:
        resolution.canonicalPatientId,

      canonicalEnterprisePatientId:
        resolution.canonicalEnterprisePatientId,

      canonicalStatus:
        resolution.canonicalStatus,

      redirected:
        resolution.redirected,

      redirectPath: [
        ...resolution.redirectPath,
      ],
    };
  }
}
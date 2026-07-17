import type {
  PatientProfileQuery,
  PatientRegistrationSlipDto,
} from '../patient.query.types.js';

import type {
  PatientActorContext,
} from '../patient.types.js';

import type {
  PatientQueryService,
} from './patient-query.service.js';

const standardProfileQuery:
  PatientProfileQuery = {
    includeInactiveContacts:
      false,
    includeInactiveAddresses:
      false,
    includeInactiveGuardians:
      false,
    includeResolvedAlerts:
      false,
  };

export interface PatientRegistrationSlipServiceOptions {
  clock?: Readonly<{
    now(): Date;
  }>;
}

const systemClock = {
  now(): Date {
    return new Date();
  },
};

export class PatientRegistrationSlipService {
  private readonly clock:
    Readonly<{
      now(): Date;
    }>;

  public constructor(
    private readonly patients:
      PatientQueryService,

    options:
      PatientRegistrationSlipServiceOptions = {},
  ) {
    this.clock =
      options.clock ??
      systemClock;
  }

  public async generate(
    patientId: string,
    actor: PatientActorContext,
  ): Promise<PatientRegistrationSlipDto> {
    const profile =
      await this.patients
        .getProfile(
          patientId,
          standardProfileQuery,
          'STANDARD',
          actor,
        );

    const primaryContact =
      profile.contacts.find(
        (contact) =>
          contact.isPrimary &&
          contact.status ===
            'ACTIVE',
      ) ??
      null;

    return {
      documentType:
        'PATIENT_REGISTRATION_SLIP',

      mrn:
        profile.patient.mrn,

      displayName:
        profile.patient.displayName,

      birthYear:
        profile.patient.birth.year,

      sexAtBirth:
        profile.patient.sexAtBirth,

      isMinor:
        profile.patient.isMinor,

      guardianNames:
        profile.guardians
          .filter(
            (guardian) =>
              guardian.isActive,
          )
          .map(
            (guardian) =>
              guardian.displayName,
          ),

      primaryContact:
        primaryContact?.displayValue ??
        null,

      registrationSource:
        profile.patient
          .registrationSource,

      registeredAt:
        profile.patient.registeredAt,

      machineReadableValue:
        `MRN:${profile.patient.mrn}`,

      generatedAt:
        this.clock.now()
          .toISOString(),
    };
  }
}
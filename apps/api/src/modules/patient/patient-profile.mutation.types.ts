import type {
  PatientAddressType,
  PatientAlertSeverity,
  PatientAlertType,
  PatientAlertVisibility,
  PatientContactPurpose,
  PatientContactType,
} from '@hospital-mis/database';

import type {
  ObjectIdString,
  PatientAddressInput,
  PatientContactInput,
} from './patient.types.js';

export interface AddPatientContactInput
extends PatientContactInput {
  reason?: string;
}

export interface UpdatePatientContactInput {
  contactType?: PatientContactType;
  purpose?: PatientContactPurpose;
  value?: string;
  contactName?: string | null;
  relationshipToPatient?: string | null;
  relatedGuardianId?: ObjectIdString | null;
  isPrimary?: boolean;
  isEmergencyContact?: boolean;
  consentToContact?: boolean;
  expectedVersion: number;
  reason: string;
}

export interface VerifyPatientContactInput {
  expectedVersion: number;
  reason: string;
}

export interface DeactivatePatientContactInput {
  expectedVersion: number;
  reason: string;
}

export interface AddPatientAddressInput
extends PatientAddressInput {
  reason?: string;
}

export interface UpdatePatientAddressInput {
  addressType?: PatientAddressType;
  line1?: string;
  line2?: string | null;
  landmark?: string | null;
  city?: string;
  district?: string | null;
  province?: string | null;
  postalCode?: string | null;
  countryCode?: string;
  isPrimary?: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  expectedVersion: number;
  reason: string;
}

export interface DeactivatePatientAddressInput {
  expectedVersion: number;
  reason: string;
}

export interface CreatePatientAlertInput {
  alertType: PatientAlertType;
  severity: PatientAlertSeverity;
  visibility: PatientAlertVisibility;
  title: string;
  details: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  reason?: string;
}

export interface ResolvePatientAlertInput {
  expectedVersion: number;
  resolutionReason: string;
}

export interface EndPatientGuardianInput {
  expectedVersion: number;
  reason: string;
}
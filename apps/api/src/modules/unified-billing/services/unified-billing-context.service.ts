import {
  BILLING_CURRENCY,
  MAX_BILLING_PAYER_SNAPSHOTS,
} from '../unified-billing.constants.js';

import {
  BillingActorInactiveError,
  BillingContextMismatchError,
  BillingPatientUnavailableError,
  BillingSourceNotBillableError,
  BillingStaffAttributionError,
} from '../unified-billing.errors.js';

import type {
  AuthoritativeBillingAccountContext,
  AuthoritativeBillingSourceContext,
  BillingPayerSnapshot,
  CreatePatientAccountInput,
  PatientAccountType,
  UnifiedBillingActorContext,
} from '../unified-billing.contracts.js';

import type {
  UnifiedBillingClockPort,
  UnifiedBillingContextPort,
  UnifiedBillingContextRepositoryPort,
} from '../unified-billing.ports.js';

function accountTypeFor(
  billingContext: AuthoritativeBillingSourceContext['billingContext'],
): PatientAccountType {
  switch (billingContext) {
    case 'OUTPATIENT':
      return 'OUTPATIENT';
    case 'INPATIENT':
      return 'INPATIENT';
    case 'EMERGENCY':
      return 'EMERGENCY';
    default:
      throw new BillingContextMismatchError(
        'The authoritative source has an unsupported billing context',
      );
  }
}

export class UnifiedBillingContextService
implements UnifiedBillingContextPort {
  public constructor(
    private readonly repository: UnifiedBillingContextRepositoryPort,
    private readonly clock: UnifiedBillingClockPort,
  ) {}

  public async requireActiveActorStaff(
    actor: Readonly<{
      userId: string;
      facilityId: string;
    }>,
  ): Promise<AuthoritativeBillingAccountContext['actor']> {
    const identity =
      await this.repository.findActorIdentity(
        actor.userId,
      );

    if (
      identity === null ||
      identity.status !== 'ACTIVE'
    ) {
      throw new BillingActorInactiveError();
    }

    if (
      identity.facilityId !== null &&
      identity.facilityId !== actor.facilityId
    ) {
      throw new BillingStaffAttributionError();
    }

    if (identity.staffId === null) {
      throw new BillingStaffAttributionError();
    }

    const staff =
      await this.repository.findStaff(
        actor.facilityId,
        identity.staffId,
      );

    if (
      staff === null ||
      !staff.isActive ||
      staff.employmentStatus !== 'ACTIVE' ||
      staff.facilityId !== actor.facilityId
    ) {
      throw new BillingStaffAttributionError();
    }

    return {
      userId: identity.userId,
      staffId: staff.staffId,
      facilityId: staff.facilityId,
      departmentId: staff.departmentId,
      displayName: staff.displayName,
      professionalType: staff.professionalType,
    };
  }

  public async resolveSource(
    actor: UnifiedBillingActorContext,
    input: Readonly<{
      sourceModule: AuthoritativeBillingSourceContext['sourceModule'];
      sourceRecordId: string;
      sourceLineId?: string | null;
    }>,
  ): Promise<AuthoritativeBillingSourceContext> {
    const record =
      await this.repository.resolveSourceContext(
        actor.facilityId,
        input.sourceModule,
        input.sourceRecordId,
        input.sourceLineId ?? null,
      );

    if (record === null) {
      throw new BillingContextMismatchError(
        'The source record was not found in the current facility',
      );
    }

    if (
      record.facilityId !== actor.facilityId ||
      record.sourceModule !== input.sourceModule ||
      record.sourceRecordId !== input.sourceRecordId ||
      record.sourceLineId !== (input.sourceLineId ?? null)
    ) {
      throw new BillingContextMismatchError(
        'The resolved source record does not match the requested financial source',
      );
    }

    if (!record.billable) {
      throw new BillingSourceNotBillableError(
        record.unbillableReason,
      );
    }

    const patient =
      await this.repository.findPatient(
        actor.facilityId,
        record.patientId,
      );

    if (
      patient === null ||
      patient.facilityId !== actor.facilityId ||
      patient.status !== 'ACTIVE'
    ) {
      throw new BillingPatientUnavailableError();
    }

    if (
      record.serviceThrough !== null &&
      record.serviceThrough.getTime() <
        record.serviceFrom.getTime()
    ) {
      throw new BillingContextMismatchError(
        'The authoritative service period is invalid',
      );
    }

    return {
      facilityId: record.facilityId,
      sourceModule: record.sourceModule,
      sourceRecordType: record.sourceRecordType,
      sourceRecordId: record.sourceRecordId,
      sourceLineId: record.sourceLineId,
      sourceOccurredAt:
        record.sourceOccurredAt.toISOString(),
      sourceStatus: record.sourceStatus,
      billable: record.billable,
      unbillableReason: record.unbillableReason,
      patient: {
        patientId: patient.patientId,
        mrn: patient.mrn,
        displayName: patient.displayName,
        status: patient.status,
      },
      billingContext: record.billingContext,
      registrationId: record.registrationId,
      opdVisitId: record.opdVisitId,
      encounterId: record.encounterId,
      admissionId: record.admissionId,
      emergencyVisitId: record.emergencyVisitId,
      departmentId: record.departmentId,
      locationId: record.locationId,
      serviceLineCode: record.serviceLineCode,
      serviceFrom: record.serviceFrom.toISOString(),
      serviceThrough:
        record.serviceThrough?.toISOString() ?? null,
    };
  }

  public async resolveAccountCreationContext(
    actor: UnifiedBillingActorContext,
    input: CreatePatientAccountInput,
  ): Promise<AuthoritativeBillingAccountContext> {
    const [source, actorStaff] =
      await Promise.all([
        this.resolveSource(actor, input),
        this.requireActiveActorStaff(actor),
      ]);

    const inferredAccountType =
      accountTypeFor(source.billingContext);
    const accountType =
      input.accountType ?? inferredAccountType;

    if (
      accountType !== inferredAccountType &&
      accountType !== 'GENERAL'
    ) {
      throw new BillingContextMismatchError(
        `Account type ${accountType} is incompatible with ${source.billingContext} source activity`,
      );
    }

    let guarantorName: string | null = null;

    if (
      input.responsiblePartyType === 'GUARANTOR'
    ) {
      if (input.guarantorId == null) {
        throw new BillingContextMismatchError(
          'Guarantor-responsible accounts require a guarantor',
        );
      }

      const guarantor =
        await this.repository.findGuarantor(
          actor.facilityId,
          input.guarantorId,
        );

      if (
        guarantor === null ||
        guarantor.facilityId !== actor.facilityId ||
        guarantor.status !== 'ACTIVE'
      ) {
        throw new BillingContextMismatchError(
          'The selected guarantor is unavailable in the current facility',
        );
      }

      guarantorName = guarantor.displayName;
    } else if (input.guarantorId != null) {
      throw new BillingContextMismatchError(
        'A guarantor cannot be supplied unless the guarantor is the responsible party',
      );
    }

    const requestedCoverageIds =
      input.payerCoverageIds ?? [];

    if (
      requestedCoverageIds.length >
      MAX_BILLING_PAYER_SNAPSHOTS
    ) {
      throw new BillingContextMismatchError(
        'Patient accounts support at most primary and secondary payer coverage',
      );
    }

    const coverageRecords =
      requestedCoverageIds.length === 0
        ? []
        : await this.repository.listCoverage(
            actor.facilityId,
            source.patient.patientId,
            requestedCoverageIds,
            this.clock.now(),
          );

    if (
      coverageRecords.length !==
      requestedCoverageIds.length
    ) {
      throw new BillingContextMismatchError(
        'One or more selected payer coverages are unavailable or ineffective',
      );
    }

    const coverageById =
      new Map(
        coverageRecords.map(
          (coverage) => [
            coverage.patientCoverageId,
            coverage,
          ] as const,
        ),
      );

    const payerSnapshots:
      BillingPayerSnapshot[] =
      requestedCoverageIds.map(
        (coverageId) => {
          const coverage =
            coverageById.get(coverageId);

          if (
            coverage === undefined ||
            coverage.facilityId !== actor.facilityId ||
            coverage.patientId !==
              source.patient.patientId ||
            coverage.status !== 'ACTIVE'
          ) {
            throw new BillingContextMismatchError(
              'Payer coverage does not belong to the authoritative source patient',
            );
          }

          return {
            sequence: coverage.sequence,
            payerOrganizationId:
              coverage.payerOrganizationId,
            panelPlanId: coverage.panelPlanId,
            patientCoverageId:
              coverage.patientCoverageId,
            payerName: coverage.payerName,
            planName: coverage.planName,
            membershipNumber:
              coverage.membershipNumber,
            authorizationReference:
              coverage.authorizationReference,
            coverageLimit: coverage.coverageLimit,
            copay: coverage.copay,
            coinsurancePercentage:
              coverage.coinsurancePercentage,
            deductible: coverage.deductible,
            coverageEffectiveFrom:
              coverage.effectiveFrom?.toISOString() ??
              null,
            coverageEffectiveThrough:
              coverage.effectiveThrough?.toISOString() ??
              null,
          };
        },
      );

    const sequences =
      payerSnapshots.map(
        (payer) => payer.sequence,
      );

    if (
      new Set(sequences).size !==
      sequences.length
    ) {
      throw new BillingContextMismatchError(
        'Primary and secondary payer positions must be unique',
      );
    }

    return {
      source,
      actor: actorStaff,
      accountType,
      payerSnapshots:
        payerSnapshots.sort(
          (left, right) =>
            left.sequence - right.sequence,
        ),
      responsiblePartyType:
        input.responsiblePartyType ??
        'PATIENT',
      guarantorId:
        input.guarantorId ?? null,
      guarantorName,
      currency: BILLING_CURRENCY,
    };
  }
}
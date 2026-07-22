import {
  PanelPlanModel,
  PatientCoverageModel,
  PayerOrganizationModel,
  decimal128,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PayerCoverageRepositoryPort,
} from '../panels-packages-coverage.ports.js';

import type {
  PanelPlanRecord,
  PatientCoverageRecord,
  PayerOrganizationRecord,
  PpcMongoSession,
} from '../panels-packages-coverage.persistence.types.js';

function record<T>(value: unknown): T {
  return value as T;
}

function sessionQuery<T extends { session(session: PpcMongoSession): T }>(
  query: T,
  session?: PpcMongoSession,
): T {
  return session === undefined ? query : query.session(session);
}

export class PayerCoverageRepository
implements PayerCoverageRepositoryPort {
  public async createPayer(
    actor: Parameters<PayerCoverageRepositoryPort['createPayer']>[0],
    input: Parameters<PayerCoverageRepositoryPort['createPayer']>[1],
    transaction: Parameters<PayerCoverageRepositoryPort['createPayer']>[2],
  ): Promise<PayerOrganizationRecord> {
    const [created] = await PayerOrganizationModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        organizationCode: input.code,
        name: input.name,
        organizationType: input.organizationType,
        registrationReference: input.registrationReference ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        status: 'DRAFT',
        active: true,
      }],
      { session: transaction.session },
    );

    return record<PayerOrganizationRecord>(created!.toObject());
  }

  public async createPlan(
    actor: Parameters<PayerCoverageRepositoryPort['createPlan']>[0],
    input: Parameters<PayerCoverageRepositoryPort['createPlan']>[1],
    transaction: Parameters<PayerCoverageRepositoryPort['createPlan']>[2],
  ): Promise<PanelPlanRecord> {
    const [created] = await PanelPlanModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        payerOrganizationId: toObjectId(
          input.payerOrganizationId,
          'payerOrganizationId',
        ),
        panelProgramId: null,
        planCode: input.code,
        name: input.name,
        description: input.description ?? null,
        deductibleAmount: decimal128(input.terms.deductibleAmount),
        copaymentAmount: decimal128(input.terms.copaymentAmount),
        coinsurancePercentage: decimal128(
          input.terms.coinsurancePercentage,
        ),
        coveragePercentage: decimal128(input.terms.coveragePercentage),
        annualLimit:
          input.terms.annualLimit === null
            ? null
            : decimal128(input.terms.annualLimit),
        lifetimeLimit:
          input.terms.lifetimeLimit === null
            ? null
            : decimal128(input.terms.lifetimeLimit),
        networkCodes: [],
        rules: input.rules.map((rule) => ({
          ruleCode: rule.code,
          effect: rule.effect,
          chargeCatalogItemId:
            rule.chargeCatalogItemId === null
              ? null
              : toObjectId(
                  rule.chargeCatalogItemId,
                  'chargeCatalogItemId',
                ),
          chargeCategoryId:
            rule.chargeCategoryId === null
              ? null
              : toObjectId(rule.chargeCategoryId, 'chargeCategoryId'),
          departmentId:
            rule.departmentId === null
              ? null
              : toObjectId(rule.departmentId, 'departmentId'),
          limitPeriod: rule.limitPeriod,
          limitQuantity:
            rule.limitQuantity === null
              ? null
              : decimal128(rule.limitQuantity),
          limitAmount:
            rule.limitAmount === null
              ? null
              : decimal128(rule.limitAmount),
          waitingPeriodDays: rule.waitingPeriodDays,
          networkCode: rule.networkCode,
          preauthorizationRequired: rule.preauthorizationRequired,
          priority: rule.priority,
        })),
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveThrough:
          input.effectiveThrough === null
            ? null
            : new Date(input.effectiveThrough),
        status: 'DRAFT',
        currentVersion: 1,
      }],
      { session: transaction.session },
    );

    return record<PanelPlanRecord>(created!.toObject());
  }

  public async findPlan(
    facilityId: string,
    planId: string,
    session?: PpcMongoSession,
  ): Promise<PanelPlanRecord | null> {
    return record<PanelPlanRecord | null>(
      await sessionQuery(
        PanelPlanModel.findOne({
          _id: toObjectId(planId, 'planId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async enrollPatient(
    actor: Parameters<PayerCoverageRepositoryPort['enrollPatient']>[0],
    input: Parameters<PayerCoverageRepositoryPort['enrollPatient']>[1],
    coverageNumber: string,
    membershipEncrypted: string | null,
    membershipHash: string | null,
    _plan: PanelPlanRecord,
    transaction: Parameters<PayerCoverageRepositoryPort['enrollPatient']>[6],
  ): Promise<PatientCoverageRecord> {
    const [created] = await PatientCoverageModel.create(
      [{
        facilityId: toObjectId(actor.facilityId, 'facilityId'),
        transactionId: transaction.transactionId,
        correlationId: actor.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: toObjectId(actor.userId, 'createdBy'),
        updatedBy: toObjectId(actor.userId, 'updatedBy'),
        coverageNumber,
        patientId: toObjectId(input.patientId, 'patientId'),
        panelPlanId: toObjectId(input.coveragePlanId, 'coveragePlanId'),
        priority: input.priority,
        policyReference: input.policyReference,
        membershipReferenceEncrypted: membershipEncrypted,
        membershipReferenceHash: membershipHash,
        employerReference: input.employerReference,
        authorizationReference: input.authorizationReference,
        eligibleFrom: new Date(input.eligibleFrom),
        eligibleThrough:
          input.eligibleThrough === null
            ? null
            : new Date(input.eligibleThrough),
        status: 'PENDING_VERIFICATION',
        lastVerificationId: null,
      }],
      { session: transaction.session },
    );

    return record<PatientCoverageRecord>(created!.toObject());
  }

  public async findPatientCoverage(
    facilityId: string,
    coverageId: string,
    session?: PpcMongoSession,
  ): Promise<PatientCoverageRecord | null> {
    return record<PatientCoverageRecord | null>(
      await sessionQuery(
        PatientCoverageModel.findOne({
          _id: toObjectId(coverageId, 'coverageId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        }).lean(),
        session,
      ).exec(),
    );
  }

  public async listActivePatientCoverage(
    facilityId: string,
    patientId: string,
    asOf: Date,
    session?: PpcMongoSession,
  ): Promise<PatientCoverageRecord[]> {
    return record<PatientCoverageRecord[]>(
      await sessionQuery(
        PatientCoverageModel.find({
          facilityId: toObjectId(facilityId, 'facilityId'),
          patientId: toObjectId(patientId, 'patientId'),
          status: 'ACTIVE',
          eligibleFrom: { $lte: asOf },
          $or: [
            { eligibleThrough: null },
            { eligibleThrough: { $gte: asOf } },
          ],
        }).sort({ priority: 1, eligibleFrom: -1 }).lean(),
        session,
      ).exec(),
    );
  }
}
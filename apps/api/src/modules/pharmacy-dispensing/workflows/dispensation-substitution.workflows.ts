import {
  toObjectId,
} from '@hospital-mis/database';

import {
  ConcurrencyConflictError,
  ConflictError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  DecideDispensationSubstitutionInput,
  PharmacyDispensingActorContext,
  ProposeDispensationSubstitutionInput,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensationSubstitutionRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PHARMACY_DISPENSING_TRANSACTION_TYPES,
} from '../pharmacy-dispensing.constants.js';

import {
  PHARMACY_DISPENSING_AUDIT_ACTIONS,
  PHARMACY_DISPENSING_OUTBOX_EVENTS,
} from '../pharmacy-dispensing.transaction.constants.js';

import {
  dispensationItemMutationLockKeys,
  dispensationItemSnapshot,
  pharmacyDeduplicationKey,
  safePharmacyJournalPayload,
} from '../pharmacy-dispensing.workflow-helpers.js';

import {
  PharmacyDispensingCommandService,
} from '../services/pharmacy-dispensing-command.service.js';

import {
  PharmacySubstitutionRepository,
} from '../repositories/pharmacy-substitution.repository.js';

export interface ProposeDispensationSubstitutionCommand {
  actor: PharmacyDispensingActorContext;
  dispensationId: string;
  dispensationItemId: string;
  input: ProposeDispensationSubstitutionInput;
  idempotencyKey: string;
}

export interface DecideDispensationSubstitutionCommand {
  actor: PharmacyDispensingActorContext;
  dispensationId: string;
  substitutionId: string;
  input: DecideDispensationSubstitutionInput;
  idempotencyKey: string;
}

export class ProposeDispensationSubstitutionWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,
    private readonly substitutions:
      PharmacySubstitutionRepository,
  ) {}

  public async execute(
    command:
      ProposeDispensationSubstitutionCommand,
  ): Promise<PharmacyDispensationSubstitutionRecord> {
    const [dispensation, item] =
      await Promise.all([
        this.support.requireDispensation(
          command.actor,
          command.dispensationId,
        ),
        this.support.requireDispensationItem(
          command.actor,
          command.dispensationId,
          command.dispensationItemId,
        ),
      ]);

    this.support.assertExpectedVersion(
      item,
      command.input.expectedItemVersion,
    );

    if (
      ![
        'PENDING_REVIEW',
        'HELD',
        'VERIFIED',
      ].includes(item.status)
    ) {
      throw new ConflictError(
        'Substitution cannot be proposed after dispensing has started',
      );
    }

    const operational =
      await this.support.dependencies.context
        .resolveOperationalContext(
          command.actor,
          dispensation.pharmacyLocationId.toHexString(),
          {
            patientId:
              dispensation.patientId.toHexString(),
            admissionId:
              dispensation.admissionId?.toHexString() ??
              null,
            requireControlledMedicine:
              dispensation.controlledMedicine,
          },
        );

    await this.support.assertAccess({
      actor:
        command.actor,
      action:
        dispensation.controlledMedicine
          ? 'CONTROLLED_DISPENSE'
          : 'VERIFY',
      location: {
        ...operational.location,
        allowsGeneralStock: true,
      },
      dispensation,
    });

    const proposedFormulary =
      await this.support.dependencies.prescriptions
        .findFormularyItem(
          command.actor.facilityId,
          command.input.proposedFormularyItemId,
        );

    if (
      proposedFormulary === null ||
      proposedFormulary.status !== 'ACTIVE'
    ) {
      throw new ResourceNotFoundError(
        'The proposed formulary substitute is unavailable',
      );
    }

    const proposedInventory =
      await this.support.dependencies.prescriptions
        .findInventoryItemForFormulary(
          command.actor.facilityId,
          command.input.proposedFormularyItemId,
        );

    if (
      proposedInventory === null ||
      proposedInventory.status !== 'ACTIVE'
    ) {
      throw new ResourceNotFoundError(
        'The proposed substitute has no active inventory mapping',
      );
    }

    if (
      proposedFormulary._id.toHexString() ===
      item.prescribedFormularyItemId.toHexString()
    ) {
      throw new ConflictError(
        'The proposed substitute is identical to the prescribed medicine',
      );
    }

    const prescriberAuthorizationRequired =
      [
        'STRENGTH',
        'DOSAGE_FORM',
      ].includes(
        command.input.substitutionType,
      ) ||
      item.controlledMedicine ||
      proposedFormulary.controlledMedicine;

    return this.support.dependencies.transactions.execute({
      transactionType:
        PHARMACY_DISPENSING_TRANSACTION_TYPES.AUTHORIZE_SUBSTITUTION,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        dispensationItemMutationLockKeys(
          command.actor.facilityId,
          command.dispensationId,
          command.dispensationItemId,
        ),
      idempotencyPayload: {
        dispensationId:
          command.dispensationId,
        dispensationItemId:
          command.dispensationItemId,
        input:
          command.input,
      },
      journalPayload:
        safePharmacyJournalPayload(
          'PROPOSE_SUBSTITUTION',
          {
            dispensationId:
              command.dispensationId,
            dispensationItemId:
              command.dispensationItemId,
            proposedFormularyItemId:
              command.input.proposedFormularyItemId,
          },
        ),
      execute: async (transaction) => {
        const freshItem =
          await this.support.requireDispensationItem(
            command.actor,
            command.dispensationId,
            command.dispensationItemId,
            transaction.session,
          );

        this.support.assertExpectedVersion(
          freshItem,
          command.input.expectedItemVersion,
        );

        const occurredAt =
          this.support.dependencies.clock.now();

        const created =
          await this.substitutions.create(
            {
              facilityId:
                toObjectId(
                  command.actor.facilityId,
                  'facilityId',
                ),
              transactionId:
                transaction.transactionId,
              correlationId:
                command.actor.correlationId,
              schemaVersion: 1,
              version: 0,
              createdBy:
                toObjectId(
                  command.actor.userId,
                  'actorUserId',
                ),
              updatedBy:
                toObjectId(
                  command.actor.userId,
                  'actorUserId',
                ),
              dispensationId:
                dispensation._id,
              dispensationItemId:
                freshItem._id,
              prescriptionItemId:
                freshItem.prescriptionItemId,
              substitutionType:
                command.input.substitutionType,
              status:
                'PROPOSED',
              prescribedFormularyItemId:
                freshItem.prescribedFormularyItemId,
              prescribedMedicineId:
                freshItem.prescribedMedicineId,
              proposedFormularyItemId:
                proposedFormulary._id,
              proposedMedicineId:
                proposedFormulary.medicineId,
              proposedInventoryItemId:
                proposedInventory._id,
              prescribedSnapshot:
                [
                  freshItem.prescribedMedicineSnapshot,
                  freshItem.prescribedStrengthSnapshot,
                  freshItem.prescribedFormSnapshot,
                ].join(' '),
              proposedSnapshot:
                proposedInventory.name,
              formularyRuleId:
                null,
              prescriberAuthorizationRequired,
              prescriberAuthorizedByProviderId:
                null,
              prescriberAuthorizedAt:
                null,
              proposedByStaffId:
                toObjectId(
                  operational.actor.staffId,
                  'actorStaffId',
                ),
              proposedAt:
                occurredAt,
              authorizedByStaffId:
                null,
              authorizedAt:
                null,
              rejectedByStaffId:
                null,
              rejectedAt:
                null,
              appliedAt:
                null,
              reason:
                command.input.reason,
              decisionReason:
                null,
            },
            transaction.session,
          );

        await this.support.dependencies.audit.append(
          {
            transactionId:
              transaction.transactionId,
            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                PHARMACY_DISPENSING_AUDIT_ACTIONS.SUBSTITUTION_PROPOSED,
                created._id.toHexString(),
              ),
            action:
              PHARMACY_DISPENSING_AUDIT_ACTIONS.SUBSTITUTION_PROPOSED,
            entityType:
              'DISPENSATION_SUBSTITUTION',
            entityId:
              created._id.toHexString(),
            actorUserId:
              command.actor.userId,
            actorStaffId:
              operational.actor.staffId,
            facilityId:
              command.actor.facilityId,
            correlationId:
              command.actor.correlationId,
            occurredAt,
            reason:
              command.input.reason,
            before:
              dispensationItemSnapshot(
                freshItem,
              ),
            after: {
              substitutionId:
                created._id.toHexString(),
              status:
                created.status,
              proposedFormularyItemId:
                created.proposedFormularyItemId.toHexString(),
              prescriberAuthorizationRequired:
                created.prescriberAuthorizationRequired,
            },
          },
          transaction.session,
        );

        await this.support.dependencies.outbox.enqueue(
          {
            transactionId:
              transaction.transactionId,
            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                PHARMACY_DISPENSING_OUTBOX_EVENTS.SUBSTITUTION_PROPOSED,
                created._id.toHexString(),
              ),
            eventType:
              PHARMACY_DISPENSING_OUTBOX_EVENTS.SUBSTITUTION_PROPOSED,
            aggregateType:
              'DISPENSATION_SUBSTITUTION',
            aggregateId:
              created._id.toHexString(),
            actorUserId:
              command.actor.userId,
            facilityId:
              command.actor.facilityId,
            correlationId:
              command.actor.correlationId,
            occurredAt,
            payload: {
              dispensationId:
                command.dispensationId,
              dispensationItemId:
                command.dispensationItemId,
              substitutionId:
                created._id.toHexString(),
              status:
                created.status,
            },
          },
          transaction.session,
        );

        return created;
      },
    });
  }
}

export class DecideDispensationSubstitutionWorkflow {
  public constructor(
    private readonly support:
      PharmacyDispensingCommandService,
    private readonly substitutions:
      PharmacySubstitutionRepository,
  ) {}

  public async execute(
    command:
      DecideDispensationSubstitutionCommand,
  ): Promise<PharmacyDispensationSubstitutionRecord> {
    const current =
      await this.substitutions.findById(
        command.actor.facilityId,
        command.substitutionId,
      );

    if (
      current === null ||
      current.dispensationId.toHexString() !==
        command.dispensationId
    ) {
      throw new ResourceNotFoundError(
        'The pharmacy substitution was not found',
      );
    }

    if (current.status !== 'PROPOSED') {
      throw new ConflictError(
        'Only proposed substitutions can be decided',
      );
    }

    if (
      current.proposedByStaffId.toHexString() ===
      command.actor.userId
    ) {
      throw new ConflictError(
        'The substitution proposer cannot approve their own proposal',
      );
    }

    if (
      command.input.decision ===
        'AUTHORIZE' &&
      current.prescriberAuthorizationRequired &&
      command.input.prescriberAuthorizationProviderId ==
        null
    ) {
      throw new ConflictError(
        'This substitution requires explicit prescriber authorization',
      );
    }

    const dispensation =
      await this.support.requireDispensation(
        command.actor,
        command.dispensationId,
      );

    const operational =
      await this.support.dependencies.context
        .resolveOperationalContext(
          command.actor,
          dispensation.pharmacyLocationId.toHexString(),
          {
            patientId:
              dispensation.patientId.toHexString(),
            requireControlledMedicine:
              dispensation.controlledMedicine,
          },
        );

    await this.support.assertAccess({
      actor:
        command.actor,
      action:
        dispensation.controlledMedicine
          ? 'CONTROLLED_DISPENSE'
          : 'VERIFY',
      location: {
        ...operational.location,
        allowsGeneralStock: true,
      },
      dispensation,
    });

    return this.support.dependencies.transactions.execute({
      transactionType:
        PHARMACY_DISPENSING_TRANSACTION_TYPES.AUTHORIZE_SUBSTITUTION,
      idempotencyKey:
        command.idempotencyKey,
      actorUserId:
        command.actor.userId,
      facilityId:
        command.actor.facilityId,
      correlationId:
        command.actor.correlationId,
      lockKeys:
        dispensationItemMutationLockKeys(
          command.actor.facilityId,
          command.dispensationId,
          current.dispensationItemId.toHexString(),
        ),
      idempotencyPayload: {
        substitutionId:
          command.substitutionId,
        input:
          command.input,
      },
      journalPayload:
        safePharmacyJournalPayload(
          'DECIDE_SUBSTITUTION',
          {
            substitutionId:
              command.substitutionId,
            decision:
              command.input.decision,
          },
        ),
      execute: async (transaction) => {
        const occurredAt =
          this.support.dependencies.clock.now();

        const updated =
          await this.substitutions.decide({
            facilityId:
              command.actor.facilityId,
            substitutionId:
              command.substitutionId,
            expectedVersion:
              command.input.expectedVersion,
            status:
              command.input.decision ===
                'AUTHORIZE'
                ? 'AUTHORIZED'
                : 'REJECTED',
            actorUserId:
              command.actor.userId,
            actorStaffId:
              operational.actor.staffId,
            reason:
              command.input.reason,
            occurredAt,
            prescriberProviderId:
              command.input
                .prescriberAuthorizationProviderId,
            session:
              transaction.session,
          });

        if (updated === null) {
          throw new ConcurrencyConflictError(
            'The substitution changed before the decision was recorded',
          );
        }

        const authorized =
          updated.status ===
          'AUTHORIZED';

        const auditAction =
          authorized
            ? PHARMACY_DISPENSING_AUDIT_ACTIONS.SUBSTITUTION_AUTHORIZED
            : PHARMACY_DISPENSING_AUDIT_ACTIONS.SUBSTITUTION_REJECTED;

        const outboxEvent =
          authorized
            ? PHARMACY_DISPENSING_OUTBOX_EVENTS.SUBSTITUTION_AUTHORIZED
            : PHARMACY_DISPENSING_OUTBOX_EVENTS.SUBSTITUTION_REJECTED;

        await this.support.dependencies.audit.append(
          {
            transactionId:
              transaction.transactionId,
            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                auditAction,
                updated._id.toHexString(),
              ),
            action:
              auditAction,
            entityType:
              'DISPENSATION_SUBSTITUTION',
            entityId:
              updated._id.toHexString(),
            actorUserId:
              command.actor.userId,
            actorStaffId:
              operational.actor.staffId,
            facilityId:
              command.actor.facilityId,
            correlationId:
              command.actor.correlationId,
            occurredAt,
            reason:
              command.input.reason,
            before: {
              status:
                current.status,
              version:
                current.version,
            },
            after: {
              status:
                updated.status,
              version:
                updated.version,
              prescriberAuthorizationProviderId:
                updated.prescriberAuthorizedByProviderId?.toHexString() ??
                null,
            },
          },
          transaction.session,
        );

        await this.support.dependencies.outbox.enqueue(
          {
            transactionId:
              transaction.transactionId,
            deduplicationKey:
              pharmacyDeduplicationKey(
                transaction.transactionId,
                outboxEvent,
                updated._id.toHexString(),
              ),
            eventType:
              outboxEvent,
            aggregateType:
              'DISPENSATION_SUBSTITUTION',
            aggregateId:
              updated._id.toHexString(),
            actorUserId:
              command.actor.userId,
            facilityId:
              command.actor.facilityId,
            correlationId:
              command.actor.correlationId,
            occurredAt,
            payload: {
              dispensationId:
                updated.dispensationId.toHexString(),
              dispensationItemId:
                updated.dispensationItemId.toHexString(),
              substitutionId:
                updated._id.toHexString(),
              status:
                updated.status,
            },
          },
          transaction.session,
        );

        return updated;
      },
    });
  }
}
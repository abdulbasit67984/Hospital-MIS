import Decimal from 'decimal.js';

import {
  ConcurrencyConflictError,
  ForbiddenError,
  ResourceNotFoundError,
} from '@hospital-mis/shared';

import type {
  PharmacyDispensingActorContext,
  CreateDispensationIntakeInput,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyAccessRequest,
  PharmacyDispensingDependencies,
} from '../pharmacy-dispensing.ports.js';

import type {
  PharmacyDispensationItemRecord,
  PharmacyDispensationRecord,
  PharmacyFormularyItemRecord,
  PharmacyInventoryItemRecord,
  PharmacyMongoSession,
  PharmacyPrescriptionItemRecord,
  PharmacyPrescriptionRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  PharmacyDispensationItemNotFoundError,
  PharmacyDispensationNotFoundError,
  PharmacyPrescriptionNotFoundError,
  PharmacyPrescriptionUnavailableError,
  PharmacyStockUnavailableError,
} from '../pharmacy-dispensing.errors.js';

import {
  normalizePharmacyDecimal,
  remainingPrescriptionQuantity,
} from '../pharmacy-dispensing.workflow-helpers.js';

export interface PreparedPharmacyIntakeItem {
  prescriptionItem: PharmacyPrescriptionItemRecord;
  formulary: PharmacyFormularyItemRecord;
  inventory: PharmacyInventoryItemRecord;
  requestedQuantity: string;
  remainingQuantity: string;
}

export interface PreparedPharmacyIntake {
  prescription: PharmacyPrescriptionRecord;
  items: readonly PreparedPharmacyIntakeItem[];
  itemContexts: ReadonlyMap<
    string,
    Readonly<{
      formulary: PharmacyFormularyItemRecord;
      inventory: PharmacyInventoryItemRecord;
      requestedQuantity: string;
    }>
  >;
}

function requireAllowed(
  decision: Awaited<
    ReturnType<
      PharmacyDispensingDependencies['accessPolicy']['authorize']
    >
  >,
): void {
  if (!decision.allowed) {
    throw new ForbiddenError(
      decision.denialReason ??
        'The pharmacy operation was denied',
    );
  }
}

export class PharmacyDispensingCommandService {
  public constructor(
    public readonly dependencies:
      PharmacyDispensingDependencies,
  ) {}

  public assertExpectedVersion(
    record: Readonly<{ version: number }>,
    expectedVersion: number,
  ): void {
    if (record.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        'The pharmacy record changed before the operation could be completed',
      );
    }
  }

  public async requirePrescription(
    actor: PharmacyDispensingActorContext,
    prescriptionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyPrescriptionRecord> {
    const prescription =
      await this.dependencies.prescriptions.findPrescription(
        actor.facilityId,
        prescriptionId,
        session,
      );

    if (prescription === null) {
      throw new PharmacyPrescriptionNotFoundError();
    }

    return prescription;
  }

  public async requireDispensation(
    actor: PharmacyDispensingActorContext,
    dispensationId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationRecord> {
    const dispensation =
      await this.dependencies.repository.findById(
        actor.facilityId,
        dispensationId,
        session,
      );

    if (dispensation === null) {
      throw new PharmacyDispensationNotFoundError();
    }

    return dispensation;
  }

  public async requireDispensationItem(
    actor: PharmacyDispensingActorContext,
    dispensationId: string,
    itemId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationItemRecord> {
    const item =
      await this.dependencies.repository.findItemById(
        actor.facilityId,
        dispensationId,
        itemId,
        session,
      );

    if (item === null) {
      throw new PharmacyDispensationItemNotFoundError();
    }

    return item;
  }

  public assertPrescriptionEligible(
    prescription: PharmacyPrescriptionRecord,
    expectedVersion: number,
    at: Date,
  ): void {
    this.assertExpectedVersion(
      prescription,
      expectedVersion,
    );

    if (
      ![
        'ISSUED',
        'PARTIALLY_DISPENSED',
      ].includes(prescription.status)
    ) {
      throw new PharmacyPrescriptionUnavailableError(
        `Prescription status ${prescription.status} is not dispensable`,
      );
    }

    if (
      prescription.patientId.toHexString() !==
      prescription.requestedPatientId.toHexString()
    ) {
      throw new PharmacyPrescriptionUnavailableError(
        'The prescription patient has not been resolved to its authoritative patient',
      );
    }

    if (
      prescription.supersededByPrescriptionId !== null
    ) {
      throw new PharmacyPrescriptionUnavailableError(
        'Superseded prescriptions cannot be dispensed',
      );
    }

    if (prescription.issuedAt === null) {
      throw new PharmacyPrescriptionUnavailableError(
        'Unissued prescriptions cannot be dispensed',
      );
    }

    if (
      prescription.expiresAt !== null &&
      prescription.expiresAt.getTime() <=
        at.getTime()
    ) {
      throw new PharmacyPrescriptionUnavailableError(
        'Expired prescriptions cannot be dispensed',
      );
    }

    if (
      prescription.interactionCheckStatus ===
        'BLOCKED' ||
      prescription.unresolvedBlockingWarningCount > 0
    ) {
      throw new PharmacyPrescriptionUnavailableError(
        'The prescription contains unresolved blocking clinical warnings',
      );
    }
  }

  public async prepareIntake(
    actor: PharmacyDispensingActorContext,
    input: CreateDispensationIntakeInput,
    at: Date,
    session?: PharmacyMongoSession,
  ): Promise<PreparedPharmacyIntake> {
    const prescription =
      await this.requirePrescription(
        actor,
        input.prescriptionId,
        session,
      );

    this.assertPrescriptionEligible(
      prescription,
      input.expectedPrescriptionVersion,
      at,
    );

    const existing =
      await this.dependencies.repository.findActiveByPrescription(
        actor.facilityId,
        input.prescriptionId,
        session,
      );

    if (existing !== null) {
      throw new PharmacyPrescriptionUnavailableError(
        'An active pharmacy dispensation already exists for this prescription',
      );
    }

    const prescriptionItems =
      await this.dependencies.prescriptions.listPrescriptionItems(
        actor.facilityId,
        input.prescriptionId,
        session,
      );

    const requestedByItem = new Map(
      (input.items ?? []).map(
        (item) => [
          item.prescriptionItemId,
          item.requestedQuantity,
        ],
      ),
    );

    const restrictedItemIds =
      input.items === undefined
        ? null
        : new Set(
            input.items.map(
              (item) => item.prescriptionItemId,
            ),
          );

    const selectedItems =
      prescriptionItems.filter(
        (item) =>
          item.status === 'ACTIVE' &&
          (
            restrictedItemIds === null ||
            restrictedItemIds.has(
              item._id.toHexString(),
            )
          ),
      );

    if (
      restrictedItemIds !== null &&
      selectedItems.length !==
        restrictedItemIds.size
    ) {
      throw new ResourceNotFoundError(
        'One or more requested prescription items were not found or are inactive',
      );
    }

    if (selectedItems.length === 0) {
      throw new PharmacyPrescriptionUnavailableError(
        'The prescription contains no dispensable items',
      );
    }

    const prepared: PreparedPharmacyIntakeItem[] = [];

    for (const prescriptionItem of selectedItems) {
      const itemId =
        prescriptionItem._id.toHexString();
      const remainingQuantity =
        remainingPrescriptionQuantity(
          prescriptionItem.quantity.toString(),
          prescriptionItem.dispensedQuantity.toString(),
        );

      if (
        new Decimal(remainingQuantity).lte(0)
      ) {
        throw new PharmacyPrescriptionUnavailableError(
          `Prescription item ${itemId} is already fully dispensed`,
        );
      }

      const requestedQuantity =
        requestedByItem.get(itemId) ??
        remainingQuantity;

      if (
        new Decimal(requestedQuantity).lte(0) ||
        new Decimal(requestedQuantity).gt(
          remainingQuantity,
        )
      ) {
        throw new PharmacyPrescriptionUnavailableError(
          `Requested quantity for prescription item ${itemId} exceeds its remaining quantity`,
        );
      }

      const formulary =
        await this.dependencies.prescriptions.findFormularyItem(
          actor.facilityId,
          prescriptionItem.formularyItemId.toHexString(),
          session,
        );

      if (
        formulary === null ||
        formulary.status !== 'ACTIVE' ||
        formulary.effectiveFrom.getTime() >
          at.getTime() ||
        (
          formulary.effectiveUntil !== null &&
          formulary.effectiveUntil.getTime() <=
            at.getTime()
        )
      ) {
        throw new PharmacyPrescriptionUnavailableError(
          `Prescription item ${itemId} references an inactive formulary item`,
        );
      }

      if (
        !formulary.stockTracked ||
        formulary.inventoryItemId === null
      ) {
        throw new PharmacyStockUnavailableError();
      }

      const inventory =
        await this.dependencies.prescriptions
          .findInventoryItemForFormulary(
            actor.facilityId,
            formulary._id.toHexString(),
            session,
          );

      if (
        inventory === null ||
        inventory.status !== 'ACTIVE' ||
        inventory.negativeStockAllowed
      ) {
        throw new PharmacyStockUnavailableError();
      }

      if (
        inventory._id.toHexString() !==
        formulary.inventoryItemId.toHexString()
      ) {
        throw new PharmacyPrescriptionUnavailableError(
          'The formulary-to-inventory mapping is inconsistent',
        );
      }

      prepared.push({
        prescriptionItem,
        formulary,
        inventory,
        requestedQuantity:
          normalizePharmacyDecimal(
            requestedQuantity,
          ),
        remainingQuantity,
      });
    }

    return {
      prescription,
      items: prepared,
      itemContexts: new Map(
        prepared.map((item) => [
          item.prescriptionItem._id.toHexString(),
          {
            formulary: item.formulary,
            inventory: item.inventory,
            requestedQuantity:
              item.requestedQuantity,
          },
        ]),
      ),
    };
  }

  public async assertAccess(
    request: PharmacyAccessRequest,
  ): Promise<void> {
    requireAllowed(
      await this.dependencies.accessPolicy.authorize(
        request,
      ),
    );
  }
}
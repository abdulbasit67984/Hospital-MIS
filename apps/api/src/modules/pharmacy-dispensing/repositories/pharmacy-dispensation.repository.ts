import {
  ControlledMedicineRegisterEntryModel,
  Decimal128,
  DispensationItemModel,
  DispensationModel,
  DispensationReversalModel,
  DispensationStatusHistoryModel,
  DispensationSubstitutionModel,
  DispensingLabelModel,
  DispensingLabelPrintModel,
  PatientReturnItemModel,
  PatientReturnModel,
  PharmacyCounsellingRecordModel,
  PharmacyReviewEventModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  Query,
} from 'mongoose';

import type {
  CreateDispensationIntakeInput,
  PharmacyDispensationListQuery,
  PharmacyPage,
} from '../pharmacy-dispensing.contracts.js';

import type {
  PharmacyDispensationRepositoryPort,
} from '../pharmacy-dispensing.ports.js';

import type {
  PharmacyControlledRegisterRecord,
  PharmacyCounsellingRecord,
  PharmacyDispensationItemRecord,
  PharmacyDispensationRecord,
  PharmacyDispensationReversalRecord,
  PharmacyDispensationStatusHistoryRecord,
  PharmacyDispensationSubstitutionRecord,
  PharmacyDispensingLabelPrintRecord,
  PharmacyDispensingLabelRecord,
  PharmacyFormularyItemRecord,
  PharmacyInventoryItemRecord,
  PharmacyMongoSession,
  PharmacyPatientReturnItemRecord,
  PharmacyPatientReturnRecord,
  PharmacyPrescriptionItemRecord,
  PharmacyPrescriptionRecord,
  PharmacyReviewEventRecord,
} from '../pharmacy-dispensing.persistence.types.js';

import {
  DEFAULT_PHARMACY_DISPENSING_PAGE_SIZE,
} from '../pharmacy-dispensing.constants.js';

import {
  PHARMACY_CONTROLLED_REGISTER_INTERNAL_SELECT,
  PHARMACY_DISPENSATION_INTERNAL_SELECT,
  PHARMACY_DISPENSATION_ITEM_INTERNAL_SELECT,
  PHARMACY_REVIEW_EVENT_INTERNAL_SELECT,
} from '../pharmacy-dispensing.projections.js';

function cast<T>(value: unknown): T {
  return value as T;
}

function applySession<T>(
  query: Query<T, unknown>,
  session?: PharmacyMongoSession,
): Query<T, unknown> {
  if (session !== undefined) {
    query.session(session);
  }

  return query;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function dateFilter(
  from: string | undefined,
  to: string | undefined,
): Record<string, Date> | undefined {
  if (from === undefined && to === undefined) {
    return undefined;
  }

  return {
    ...(from === undefined ? {} : { $gte: new Date(from) }),
    ...(to === undefined ? {} : { $lte: new Date(to) }),
  };
}

function zero(): ReturnType<typeof Decimal128.fromString> {
  return Decimal128.fromString('0');
}

export class PharmacyDispensationRepository
implements PharmacyDispensationRepositoryPort {
  public async findById(
    facilityId: string,
    dispensationId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationRecord | null> {
    const query = DispensationModel.findOne({
      _id: toObjectId(dispensationId, 'dispensationId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(PHARMACY_DISPENSATION_INTERNAL_SELECT)
      .lean();

    return cast<PharmacyDispensationRecord | null>(
      await applySession(query, session).exec(),
    );
  }

  public async findActiveByPrescription(
    facilityId: string,
    prescriptionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationRecord | null> {
    const query = DispensationModel.findOne({
      facilityId: toObjectId(facilityId, 'facilityId'),
      prescriptionId: toObjectId(prescriptionId, 'prescriptionId'),
      status: {
        $in: [
          'PENDING_REVIEW',
          'HELD',
          'VERIFIED',
          'PARTIALLY_RESERVED',
          'RESERVED',
          'IN_PROGRESS',
          'PARTIALLY_DISPENSED',
          'REVERSAL_PENDING',
          'RECOVERY_REQUIRED',
        ],
      },
    })
      .select(PHARMACY_DISPENSATION_INTERNAL_SELECT)
      .sort({ queuedAt: -1, _id: -1 })
      .lean();

    return cast<PharmacyDispensationRecord | null>(
      await applySession(query, session).exec(),
    );
  }

  public async list(
    facilityId: string,
    query: PharmacyDispensationListQuery,
  ): Promise<PharmacyPage<PharmacyDispensationRecord>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PHARMACY_DISPENSING_PAGE_SIZE;
    const queuedAt = dateFilter(query.from, query.to);
    const filter: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.status === undefined ? {} : { status: { $in: [...query.status] } }),
      ...(query.context === undefined ? {} : { context: { $in: [...query.context] } }),
      ...(query.priority === undefined ? {} : { priority: { $in: [...query.priority] } }),
      ...(query.pharmacyLocationId === undefined
        ? {}
        : {
            pharmacyLocationId: toObjectId(
              query.pharmacyLocationId,
              'pharmacyLocationId',
            ),
          }),
      ...(query.patientId === undefined
        ? {}
        : { patientId: toObjectId(query.patientId, 'patientId') }),
      ...(query.prescriptionId === undefined
        ? {}
        : { prescriptionId: toObjectId(query.prescriptionId, 'prescriptionId') }),
      ...(query.admissionId === undefined
        ? {}
        : { admissionId: toObjectId(query.admissionId, 'admissionId') }),
      ...(query.controlledMedicine === undefined
        ? {}
        : { controlledMedicine: query.controlledMedicine }),
      ...(queuedAt === undefined ? {} : { queuedAt }),
    };

    if (query.search !== undefined) {
      const expression = new RegExp(escapeRegex(query.search), 'iu');
      filter['$or'] = [
        { dispensationNumber: expression },
        { prescriptionNumberSnapshot: expression },
      ];
    }

    const direction = query.sortDirection === 'desc' ? -1 : 1;
    const sortField = query.sortBy ?? 'queuedAt';
    const sort = {
      [sortField]: direction,
      _id: direction,
    } as Record<string, 1 | -1>;

    const [items, totalItems] = await Promise.all([
      DispensationModel.find(filter)
        .select(PHARMACY_DISPENSATION_INTERNAL_SELECT)
        .sort(sort)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      DispensationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: cast<PharmacyDispensationRecord[]>(items),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  public async listItems(
    facilityId: string,
    dispensationId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationItemRecord[]> {
    const query = DispensationItemModel.find({
      facilityId: toObjectId(facilityId, 'facilityId'),
      dispensationId: toObjectId(dispensationId, 'dispensationId'),
    })
      .select(PHARMACY_DISPENSATION_ITEM_INTERNAL_SELECT)
      .sort({ lineNumber: 1, _id: 1 })
      .lean();

    return cast<PharmacyDispensationItemRecord[]>(
      await applySession(query, session).exec(),
    );
  }

  public async findItemById(
    facilityId: string,
    dispensationId: string,
    itemId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationItemRecord | null> {
    const query = DispensationItemModel.findOne({
      _id: toObjectId(itemId, 'dispensationItemId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
      dispensationId: toObjectId(dispensationId, 'dispensationId'),
    })
      .select(PHARMACY_DISPENSATION_ITEM_INTERNAL_SELECT)
      .lean();

    return cast<PharmacyDispensationItemRecord | null>(
      await applySession(query, session).exec(),
    );
  }

  public async createAggregate(
    input: CreateDispensationIntakeInput,
    prepared: Readonly<{
      dispensationNumber: string;
      patientId: string;
      prescription: PharmacyPrescriptionRecord;
      prescriptionItems: readonly PharmacyPrescriptionItemRecord[];
      itemContexts: ReadonlyMap<
        string,
        Readonly<{
          formulary: PharmacyFormularyItemRecord;
          inventory: PharmacyInventoryItemRecord;
          requestedQuantity: string;
        }>
      >;
      actorUserId: string;
      transactionId: string;
      correlationId: string;
      queuedAt: Date;
      expiresAt: Date;
      operationKey: string;
    }>,
    session: PharmacyMongoSession,
  ): Promise<{
    dispensation: PharmacyDispensationRecord;
    items: PharmacyDispensationItemRecord[];
  }> {
    const actorUserId = toObjectId(prepared.actorUserId, 'actorUserId');
    const facilityId = prepared.prescription.facilityId;
    const patientId = toObjectId(prepared.patientId, 'patientId');
    const locationId = toObjectId(input.pharmacyLocationId, 'pharmacyLocationId');
    const itemContexts = prepared.prescriptionItems.map((prescriptionItem) => {
      const context = prepared.itemContexts.get(prescriptionItem._id.toHexString());

      if (context === undefined) {
        throw new Error(
          `Prepared pharmacy intake context is missing for prescription item ${prescriptionItem._id.toHexString()}`,
        );
      }

      return {
        prescriptionItem,
        ...context,
      };
    });
    const controlledMedicine = itemContexts.some(
      ({ formulary, inventory }) =>
        formulary.controlledMedicine || inventory.controlledMedicine,
    );
    const highAlertMedicine = itemContexts.some(
      ({ formulary, inventory }) => formulary.highAlert || inventory.highAlert,
    );

    const [createdHeader] = await DispensationModel.create(
      [
        {
          facilityId,
          dispensationNumber: prepared.dispensationNumber,
          creationOperationKey: prepared.operationKey,
          prescriptionId: prepared.prescription._id,
          prescriptionNumberSnapshot: prepared.prescription.prescriptionNumber,
          prescriptionRevisionNumber: prepared.prescription.revisionNumber,
          prescriptionVersion: prepared.prescription.version,
          patientId,
          requestedPatientId: prepared.prescription.requestedPatientId,
          encounterId: prepared.prescription.encounterId,
          registrationId: prepared.prescription.registrationId,
          opdVisitId: prepared.prescription.opdVisitId,
          admissionId:
            input.admissionId == null
              ? null
              : toObjectId(input.admissionId, 'admissionId'),
          wardId:
            input.wardId == null
              ? null
              : toObjectId(input.wardId, 'wardId'),
          departmentId: prepared.prescription.departmentId,
          servicePointId: prepared.prescription.servicePointId,
          prescriberProviderId: prepared.prescription.prescriberProviderId,
          pharmacyLocationId: locationId,
          sourceStockLocationId: locationId,
          context: input.context,
          priority: input.priority ?? 'ROUTINE',
          status: 'PENDING_REVIEW',
          lineCount: itemContexts.length,
          verifiedLineCount: 0,
          completedLineCount: 0,
          controlledMedicine,
          highAlertMedicine,
          secondCheckRequired: controlledMedicine || highAlertMedicine,
          witnessRequired: controlledMedicine,
          stockReservationId: null,
          queuedAt: prepared.queuedAt,
          reviewStartedAt: null,
          verifiedAt: null,
          verifiedByStaffId: null,
          secondCheckedAt: null,
          secondCheckedByStaffId: null,
          firstDispensedAt: null,
          completedAt: null,
          dispensedByStaffId: null,
          heldAt: null,
          heldByStaffId: null,
          holdReason: null,
          rejectedAt: null,
          rejectedByStaffId: null,
          rejectionReason: null,
          cancelledAt: null,
          cancelledByStaffId: null,
          cancellationReason: null,
          enteredInErrorAt: null,
          enteredInErrorByStaffId: null,
          enteredInErrorReason: null,
          expiredAt: null,
          expiresAt: prepared.expiresAt,
          currency: 'PKR',
          grossAmount: zero(),
          discountAmount: zero(),
          taxAmount: zero(),
          netAmount: zero(),
          billingOperationKey: null,
          billingSourceRecordId: null,
          finalizationState: 'NOT_STARTED',
          finalizationAttemptCount: 0,
          finalizationUpdatedAt: null,
          recoveryReason: null,
          lastFailureCode: null,
          attachmentIds: [],
          transactionId: prepared.transactionId,
          correlationId: prepared.correlationId,
          schemaVersion: 1,
          version: 0,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      ],
      { session },
    );

    if (createdHeader === undefined) {
      throw new Error('Pharmacy dispensation creation returned no header');
    }

    const createdItems = await DispensationItemModel.create(
      itemContexts.map(({ prescriptionItem, formulary, inventory, requestedQuantity }, index) => ({
        facilityId,
        dispensationId: createdHeader._id,
        prescriptionId: prepared.prescription._id,
        prescriptionItemId: prescriptionItem._id,
        patientId,
        lineNumber: index + 1,
        prescribedFormularyItemId: prescriptionItem.formularyItemId,
        prescribedMedicineId: prescriptionItem.medicineId,
        prescribedMedicineFormId: prescriptionItem.medicineFormId,
        prescribedMedicineStrengthId: prescriptionItem.medicineStrengthId,
        prescribedRouteId: prescriptionItem.routeId,
        prescribedFrequencyId: prescriptionItem.frequencyId,
        prescribedMedicineSnapshot: prescriptionItem.genericNameSnapshot,
        prescribedStrengthSnapshot: prescriptionItem.medicineStrengthSnapshot,
        prescribedFormSnapshot: prescriptionItem.medicineFormSnapshot,
        prescribedRouteSnapshot: prescriptionItem.routeSnapshot,
        prescribedFrequencySnapshot: prescriptionItem.frequencySnapshot,
        prescribedInstructionsSnapshot: prescriptionItem.instructions,
        prescribedQuantity: prescriptionItem.quantity,
        prescribedQuantityUnitId: prescriptionItem.quantityUnitId,
        requestedQuantity: Decimal128.fromString(requestedQuantity),
        approvedQuantity: zero(),
        reservedQuantity: zero(),
        dispensedQuantity: zero(),
        returnedQuantity: zero(),
        reversedQuantity: zero(),
        dispensedQuantityUnitId: null,
        actualFormularyItemId: formulary._id,
        actualMedicineId: formulary.medicineId,
        actualMedicineFormId: formulary.medicineFormId,
        actualMedicineStrengthId: formulary.medicineStrengthId,
        actualInventoryItemId: inventory._id,
        actualMedicineSnapshot: prescriptionItem.genericNameSnapshot,
        actualStrengthSnapshot: prescriptionItem.medicineStrengthSnapshot,
        actualFormSnapshot: prescriptionItem.medicineFormSnapshot,
        substitutionId: null,
        substitutionApplied: false,
        quantityRoundingApplied: false,
        quantityRoundingReason: null,
        specialHandling: [],
        controlledMedicine:
          formulary.controlledMedicine || inventory.controlledMedicine,
        highAlertMedicine: formulary.highAlert || inventory.highAlert,
        safetyAlerts: [],
        blockingAlertCount: 0,
        allocations: [],
        unitSellingPrice: zero(),
        grossAmount: zero(),
        discountAmount: zero(),
        taxAmount: zero(),
        netAmount: zero(),
        pricingSource: null,
        priceOverrideApplied: false,
        priceOverrideReason: null,
        priceOverrideApprovedByStaffId: null,
        status: 'PENDING_REVIEW',
        verifiedByStaffId: null,
        verifiedAt: null,
        dispensedByStaffId: null,
        dispensedAt: null,
        holdReason: null,
        rejectionReason: null,
        transactionId: prepared.transactionId,
        correlationId: prepared.correlationId,
        schemaVersion: 1,
        version: 0,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      })),
      { session },
    );

    return {
      dispensation: cast<PharmacyDispensationRecord>(createdHeader.toObject()),
      items: createdItems.map((item) =>
        cast<PharmacyDispensationItemRecord>(item.toObject()),
      ),
    };
  }

  public async updateDispensation(
    facilityId: string,
    dispensationId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
    actorUserId: string,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationRecord | null> {
    const set = cast<Record<string, unknown>>(update['$set'] ?? {});

    return cast<PharmacyDispensationRecord | null>(
      await DispensationModel.findOneAndUpdate(
        {
          _id: toObjectId(dispensationId, 'dispensationId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          version: expectedVersion,
        },
        {
          ...update,
          $set: {
            ...set,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
            updatedAt: new Date(),
          },
        },
        { new: true, runValidators: true, session },
      )
        .select(PHARMACY_DISPENSATION_INTERNAL_SELECT)
        .lean()
        .exec(),
    );
  }

  public async updateItem(
    facilityId: string,
    dispensationId: string,
    itemId: string,
    expectedVersion: number,
    update: Record<string, unknown>,
    actorUserId: string,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationItemRecord | null> {
    const set = cast<Record<string, unknown>>(update['$set'] ?? {});

    return cast<PharmacyDispensationItemRecord | null>(
      await DispensationItemModel.findOneAndUpdate(
        {
          _id: toObjectId(itemId, 'dispensationItemId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
          dispensationId: toObjectId(dispensationId, 'dispensationId'),
          version: expectedVersion,
        },
        {
          ...update,
          $set: {
            ...set,
            updatedBy: toObjectId(actorUserId, 'actorUserId'),
            updatedAt: new Date(),
          },
        },
        { new: true, runValidators: true, session },
      )
        .select(PHARMACY_DISPENSATION_ITEM_INTERNAL_SELECT)
        .lean()
        .exec(),
    );
  }

  public async appendStatusHistory(
    recordInput: Omit<
      PharmacyDispensationStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationStatusHistoryRecord> {
    const [created] = await DispensationStatusHistoryModel.create(
      [recordInput],
      { session },
    );

    if (created === undefined) {
      throw new Error('Dispensation status-history creation returned no record');
    }

    return cast<PharmacyDispensationStatusHistoryRecord>(created.toObject());
  }

  public async appendReviewEvent(
    recordInput: Omit<PharmacyReviewEventRecord, '_id' | 'createdAt' | 'updatedAt'>,
    session: PharmacyMongoSession,
  ): Promise<PharmacyReviewEventRecord> {
    const [created] = await PharmacyReviewEventModel.create(
      [recordInput],
      { session },
    );

    if (created === undefined) {
      throw new Error('Pharmacy review-event creation returned no record');
    }

    return cast<PharmacyReviewEventRecord>(created.toObject());
  }

  public async createSubstitution(
    recordInput: Omit<
      PharmacyDispensationSubstitutionRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationSubstitutionRecord> {
    const [created] = await DispensationSubstitutionModel.create(
      [recordInput],
      { session },
    );

    if (created === undefined) {
      throw new Error('Dispensation-substitution creation returned no record');
    }

    return cast<PharmacyDispensationSubstitutionRecord>(created.toObject());
  }

  public async findSubstitution(
    facilityId: string,
    substitutionId: string,
    session?: PharmacyMongoSession,
  ): Promise<PharmacyDispensationSubstitutionRecord | null> {
    const query = DispensationSubstitutionModel.findOne({
      _id: toObjectId(substitutionId, 'substitutionId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select('+reason +decisionReason')
      .lean();

    return cast<PharmacyDispensationSubstitutionRecord | null>(
      await applySession(query, session).exec(),
    );
  }

  public async createControlledRegisterEntry(
    recordInput: Omit<
      PharmacyControlledRegisterRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PharmacyMongoSession,
  ): Promise<PharmacyControlledRegisterRecord> {
    const [created] = await ControlledMedicineRegisterEntryModel.create(
      [recordInput],
      { session },
    );

    if (created === undefined) {
      throw new Error('Controlled-register creation returned no record');
    }

    return cast<PharmacyControlledRegisterRecord>(created.toObject());
  }

  public async createLabel(
    recordInput: Omit<PharmacyDispensingLabelRecord, '_id' | 'createdAt' | 'updatedAt'>,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensingLabelRecord> {
    const [created] = await DispensingLabelModel.create([recordInput], { session });

    if (created === undefined) {
      throw new Error('Dispensing-label creation returned no record');
    }

    return cast<PharmacyDispensingLabelRecord>(created.toObject());
  }

  public async appendLabelPrint(
    recordInput: Omit<
      PharmacyDispensingLabelPrintRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensingLabelPrintRecord> {
    const [created] = await DispensingLabelPrintModel.create(
      [recordInput],
      { session },
    );

    if (created === undefined) {
      throw new Error('Dispensing-label print creation returned no record');
    }

    return cast<PharmacyDispensingLabelPrintRecord>(created.toObject());
  }

  public async createCounsellingRecord(
    recordInput: Omit<PharmacyCounsellingRecord, '_id' | 'createdAt' | 'updatedAt'>,
    session: PharmacyMongoSession,
  ): Promise<PharmacyCounsellingRecord> {
    const [created] = await PharmacyCounsellingRecordModel.create(
      [recordInput],
      { session },
    );

    if (created === undefined) {
      throw new Error('Pharmacy counselling creation returned no record');
    }

    return cast<PharmacyCounsellingRecord>(created.toObject());
  }

  public async createPatientReturn(
    aggregate: Readonly<{
      header: Omit<PharmacyPatientReturnRecord, '_id' | 'createdAt' | 'updatedAt'>;
      items: ReadonlyArray<
        Omit<PharmacyPatientReturnItemRecord, '_id' | 'createdAt' | 'updatedAt'>
      >;
    }>,
    session: PharmacyMongoSession,
  ): Promise<{
    header: PharmacyPatientReturnRecord;
    items: PharmacyPatientReturnItemRecord[];
  }> {
    const [header] = await PatientReturnModel.create([aggregate.header], { session });

    if (header === undefined) {
      throw new Error('Patient-return creation returned no header');
    }

    const items = await PatientReturnItemModel.create(
      aggregate.items.map((item) => ({
        ...item,
        patientReturnId: header._id,
      })),
      { session },
    );

    return {
      header: cast<PharmacyPatientReturnRecord>(header.toObject()),
      items: items.map((item) => cast<PharmacyPatientReturnItemRecord>(item.toObject())),
    };
  }

  public async createReversal(
    recordInput: Omit<
      PharmacyDispensationReversalRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    session: PharmacyMongoSession,
  ): Promise<PharmacyDispensationReversalRecord> {
    const [created] = await DispensationReversalModel.create(
      [recordInput],
      { session },
    );

    if (created === undefined) {
      throw new Error('Dispensation-reversal creation returned no record');
    }

    return cast<PharmacyDispensationReversalRecord>(created.toObject());
  }
}
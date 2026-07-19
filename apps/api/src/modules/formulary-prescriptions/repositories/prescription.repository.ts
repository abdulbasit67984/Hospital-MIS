import type {
  FilterQuery,
} from 'mongoose';

import {
  PrescriptionItemModel,
  PrescriptionModel,
  PrescriptionSafetyWarningModel,
  PrescriptionStatusHistoryModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PrescriptionStatus,
} from '@hospital-mis/database';

import type {
  PrescriptionLifecyclePersistenceUpdate,
  PrescriptionRepositoryPort,
  PrescriptionSafetyFinding,
  PrescriptionSafetyWarningRepositoryPort,
} from '../formulary-prescriptions.ports.js';

import type {
  PrescriptionItemRecord,
  PrescriptionRecord,
  PrescriptionSafetyWarningRecord,
  PrescriptionStatusHistoryRecord,
} from '../formulary-prescriptions.persistence.types.js';

import type {
  PrescriptionListQuery,
} from '../formulary-prescriptions.types.js';

import {
  PRESCRIPTION_HISTORY_INTERNAL_SELECT,
  PRESCRIPTION_INTERNAL_SELECT,
  PRESCRIPTION_ITEM_CONTENT_SELECT,
  PRESCRIPTION_WARNING_CONTENT_SELECT,
} from '../formulary-prescriptions.projections.js';

import {
  throwMappedFormularyPrescriptionPersistenceError,
} from '../formulary-prescriptions.persistence-errors.js';

function record<T>(
  value: unknown,
): T {
  return value as T;
}

export class PrescriptionRepository
implements
  PrescriptionRepositoryPort,
  PrescriptionSafetyWarningRepositoryPort {
  public async findById(
    facilityId: string,
    prescriptionId: string,
  ): Promise<PrescriptionRecord | null> {
    return record<PrescriptionRecord | null>(
      await PrescriptionModel.findOne({
        _id:
          toObjectId(
            prescriptionId,
            'prescriptionId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          PRESCRIPTION_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async findByNumber(
    facilityId: string,
    prescriptionNumber: string,
  ): Promise<PrescriptionRecord | null> {
    return record<PrescriptionRecord | null>(
      await PrescriptionModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        prescriptionNumber:
          prescriptionNumber
            .trim()
            .toUpperCase(),
      })
        .select(
          PRESCRIPTION_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async list(
    facilityId: string,
    query: PrescriptionListQuery,
  ): Promise<{
    items: PrescriptionRecord[];
    total: number;
  }> {
    const filter:
      FilterQuery<unknown> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      };

    if (query.patientId !== undefined) {
      filter['patientId'] =
        toObjectId(
          query.patientId,
          'patientId',
        );
    }

    if (query.encounterId !== undefined) {
      filter['encounterId'] =
        toObjectId(
          query.encounterId,
          'encounterId',
        );
    }

    if (
      query.prescriberProviderId !==
      undefined
    ) {
      filter['prescriberProviderId'] =
        toObjectId(
          query.prescriberProviderId,
          'prescriberProviderId',
        );
    }

    if (query.status !== undefined) {
      filter['status'] =
        query.status;
    }

    if (
      query.issuedFrom !== undefined ||
      query.issuedTo !== undefined
    ) {
      filter['issuedAt'] = {
        ...(query.issuedFrom === undefined
          ? {}
          : {
              $gte:
                new Date(
                  query.issuedFrom,
                ),
            }),

        ...(query.issuedTo === undefined
          ? {}
          : {
              $lte:
                new Date(
                  query.issuedTo,
                ),
            }),
      };
    }

    const direction =
      query.sortDirection === 'asc'
        ? 1
        : -1;

    const skip =
      (query.page - 1) *
      query.pageSize;

    const [
      items,
      total,
    ] =
      await Promise.all([
        PrescriptionModel.find(
          filter,
        )
          .select(
            PRESCRIPTION_INTERNAL_SELECT,
          )
          .sort({
            [query.sortBy]:
              direction,

            _id:
              direction,
          })
          .skip(
            skip,
          )
          .limit(
            query.pageSize,
          )
          .lean()
          .exec(),

        PrescriptionModel.countDocuments(
          filter,
        )
          .exec(),
      ]);

    return {
      items:
        record<PrescriptionRecord[]>(
          items,
        ),

      total,
    };
  }

  public async listItems(
    facilityId: string,
    prescriptionId: string,
  ): Promise<PrescriptionItemRecord[]> {
    return record<PrescriptionItemRecord[]>(
      await PrescriptionItemModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        prescriptionId:
          toObjectId(
            prescriptionId,
            'prescriptionId',
          ),
      })
        .select(
          PRESCRIPTION_ITEM_CONTENT_SELECT,
        )
        .sort({
          sequence:
            1,
        })
        .lean()
        .exec(),
    );
  }

  public async listActivePatientMedicineItems(
    facilityId: string,
    patientId: string,
    medicineIds?: readonly string[],
  ): Promise<PrescriptionItemRecord[]> {
    const filter:
      FilterQuery<unknown> = {
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        patientId:
          toObjectId(
            patientId,
            'patientId',
          ),

        status:
          'ACTIVE',

        $expr: {
          $lt: [
            {
              $toDecimal:
                '$dispensedQuantity',
            },
            {
              $toDecimal:
                '$quantity',
            },
          ],
        },
      };

    if (
      medicineIds !== undefined &&
      medicineIds.length > 0
    ) {
      filter['medicineId'] = {
        $in:
          medicineIds.map(
            (medicineId) =>
              toObjectId(
                medicineId,
                'medicineIds',
              ),
          ),
      };
    }

    return record<PrescriptionItemRecord[]>(
      await PrescriptionItemModel.find(
        filter,
      )
        .select(
          PRESCRIPTION_ITEM_CONTENT_SELECT,
        )
        .sort({
          createdAt:
            -1,
        })
        .lean()
        .exec(),
    );
  }

  public async listHistory(
    facilityId: string,
    prescriptionId: string,
  ): Promise<PrescriptionStatusHistoryRecord[]> {
    return record<PrescriptionStatusHistoryRecord[]>(
      await PrescriptionStatusHistoryModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        prescriptionId:
          toObjectId(
            prescriptionId,
            'prescriptionId',
          ),
      })
        .select(
          PRESCRIPTION_HISTORY_INTERNAL_SELECT,
        )
        .sort({
          sequence:
            1,
        })
        .lean()
        .exec(),
    );
  }

  public async create(
    prescription: Omit<
      PrescriptionRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
    items: ReadonlyArray<
      Omit<
        PrescriptionItemRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >
    >,
  ): Promise<{
    prescription: PrescriptionRecord;
    items: PrescriptionItemRecord[];
  }> {
    let createdPrescription:
      PrescriptionRecord;

    try {
      const document =
        await PrescriptionModel.create(
          prescription,
        );

      createdPrescription =
        record<PrescriptionRecord>(
          document.toObject(),
        );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_PRESCRIPTION',
      );
    }

    try {
      const documents =
        await PrescriptionItemModel.insertMany(
          items,
          {
            ordered:
              true,
          },
        );

      return {
        prescription:
          createdPrescription,

        items:
          record<PrescriptionItemRecord[]>(
            documents.map(
              (document) =>
                document.toObject(),
            ),
          ),
      };
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_PRESCRIPTION_ITEM',
      );
    }
  }

  public async replaceDraftItems(
    facilityId: string,
    prescriptionId: string,
    expectedVersion: number,
    items: ReadonlyArray<
      Omit<
        PrescriptionItemRecord,
        '_id' | 'createdAt' | 'updatedAt'
      >
    >,
    actorUserId: string,
    _transactionId: string,
    _correlationId: string,
    _occurredAt: Date,
  ): Promise<{
    prescription: PrescriptionRecord;
    items: PrescriptionItemRecord[];
  } | null> {
    const current =
      await PrescriptionModel.findOne({
        _id:
          toObjectId(
            prescriptionId,
            'prescriptionId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        status:
          'DRAFT',

        version:
          expectedVersion,
      })
        .select(
          '_id version status',
        )
        .lean()
        .exec();

    if (current === null) {
      return null;
    }

    await PrescriptionItemModel.deleteMany({
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),

      prescriptionId:
        toObjectId(
          prescriptionId,
          'prescriptionId',
        ),
    })
      .exec();

    let createdItems:
      PrescriptionItemRecord[];

    try {
      const documents =
        await PrescriptionItemModel.insertMany(
          items,
          {
            ordered:
              true,
          },
        );

      createdItems =
        record<PrescriptionItemRecord[]>(
          documents.map(
            (document) =>
              document.toObject(),
          ),
        );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_PRESCRIPTION_ITEM',
      );
    }

    const updated =
      await PrescriptionModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              prescriptionId,
              'prescriptionId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          status:
            'DRAFT',

          version:
            expectedVersion,
        },
        {
          $set: {
            itemCount:
              createdItems.length,

            activeItemCount:
              createdItems.filter(
                (item) =>
                  item.status ===
                  'ACTIVE',
              ).length,

            dispensedItemCount:
              0,

            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
          },

          $inc: {
            version:
              1,
          },
        },
        {
          new:
            true,

          runValidators:
            true,
        },
      )
        .select(
          PRESCRIPTION_INTERNAL_SELECT,
        )
        .lean()
        .exec();

    return updated === null
      ? null
      : {
          prescription:
            record<PrescriptionRecord>(
              updated,
            ),

          items:
            createdItems,
        };
  }

  public async transitionStatus(
    facilityId: string,
    prescriptionId: string,
    expectedVersion: number,
    fromStatuses:
      readonly PrescriptionStatus[],
    update:
      PrescriptionLifecyclePersistenceUpdate,
  ): Promise<PrescriptionRecord | null> {
    const {
      version:
        _ignoredVersion,
      ...safeUpdate
    } = update;

    return record<PrescriptionRecord | null>(
      await PrescriptionModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              prescriptionId,
              'prescriptionId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          status: {
            $in:
              fromStatuses,
          },

          version:
            expectedVersion,
        },
        {
          $set:
            safeUpdate,

          $inc: {
            version:
              1,
          },
        },
        {
          new:
            true,

          runValidators:
            true,
        },
      )
        .select(
          PRESCRIPTION_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async linkReplacement(
    facilityId: string,
    supersededPrescriptionId: string,
    replacementPrescriptionId: string,
    expectedVersion: number,
  ): Promise<PrescriptionRecord | null> {
    return record<PrescriptionRecord | null>(
      await PrescriptionModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              supersededPrescriptionId,
              'supersededPrescriptionId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,

          supersededByPrescriptionId:
            null,
        },
        {
          $set: {
            supersededByPrescriptionId:
              toObjectId(
                replacementPrescriptionId,
                'replacementPrescriptionId',
              ),
          },

          $inc: {
            version:
              1,
          },
        },
        {
          new:
            true,

          runValidators:
            true,
        },
      )
        .select(
          PRESCRIPTION_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async appendHistory(
    history: Omit<
      PrescriptionStatusHistoryRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<PrescriptionStatusHistoryRecord> {
    try {
      const created =
        await PrescriptionStatusHistoryModel.create(
          history,
        );

      return record<PrescriptionStatusHistoryRecord>(
        created.toObject(),
      );
    } catch (error) {
      throwMappedFormularyPrescriptionPersistenceError(
        error,
        'CREATE_PRESCRIPTION_HISTORY',
      );
    }
  }

  public async markPrinted(
    facilityId: string,
    prescriptionId: string,
    expectedVersion: number,
    actorUserId: string,
    printedAt: Date,
  ): Promise<PrescriptionRecord | null> {
    return record<PrescriptionRecord | null>(
      await PrescriptionModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              prescriptionId,
              'prescriptionId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,
        },
        {
          $set: {
            lastPrintedAt:
              printedAt,

            lastPrintedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),

            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
          },

          $inc: {
            printRevision:
              1,

            version:
              1,
          },
        },
        {
          new:
            true,

          runValidators:
            true,
        },
      )
        .select(
          PRESCRIPTION_INTERNAL_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async replaceOpenFindings(
    facilityId: string,
    prescriptionId: string,
    patientId: string,
    encounterId: string,
    findings:
      readonly PrescriptionSafetyFinding[],
    actorUserId: string,
    transactionId: string,
    correlationId: string,
    detectedAt: Date,
  ): Promise<PrescriptionSafetyWarningRecord[]> {
    const findingFingerprints =
      new Set(
        findings.map(
          (finding) =>
            finding.warningFingerprint,
        ),
      );

    const openWarnings =
      record<PrescriptionSafetyWarningRecord[]>(
        await PrescriptionSafetyWarningModel.find({
          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          prescriptionId:
            toObjectId(
              prescriptionId,
              'prescriptionId',
            ),

          status: {
            $in: [
              'OPEN',
              'ACKNOWLEDGED',
            ],
          },
        })
          .select(
            PRESCRIPTION_WARNING_CONTENT_SELECT,
          )
          .lean()
          .exec(),
      );

    for (
      const warning of
      openWarnings
    ) {
      if (
        !findingFingerprints.has(
          warning.warningFingerprint,
        )
      ) {
        await PrescriptionSafetyWarningModel.updateOne(
          {
            _id:
              warning._id,

            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            version:
              warning.version,
          },
          {
            $set: {
              status:
                'RESOLVED',

              resolvedAt:
                detectedAt,

              resolvedBy:
                toObjectId(
                  actorUserId,
                  'actorUserId',
                ),

              resolutionReason:
                'The warning was no longer present during prescription safety re-evaluation',

              updatedBy:
                toObjectId(
                  actorUserId,
                  'actorUserId',
                ),
            },

            $inc: {
              version:
                1,
            },
          },
          {
            runValidators:
              true,
          },
        )
          .exec();
      }
    }

    for (
      const finding of
      findings
    ) {
      try {
        await PrescriptionSafetyWarningModel.updateOne(
          {
            facilityId:
              toObjectId(
                facilityId,
                'facilityId',
              ),

            prescriptionId:
              toObjectId(
                prescriptionId,
                'prescriptionId',
              ),

            warningFingerprint:
              finding.warningFingerprint,
          },
          {
            $setOnInsert: {
              prescriptionItemId:
                finding.prescriptionItemId ==
                null
                  ? null
                  : toObjectId(
                      finding.prescriptionItemId,
                      'prescriptionItemId',
                    ),

              patientId:
                toObjectId(
                  patientId,
                  'patientId',
                ),

              encounterId:
                toObjectId(
                  encounterId,
                  'encounterId',
                ),

              warningType:
                finding.warningType,

              severity:
                finding.severity,

              warningCode:
                finding.warningCode,

              message:
                finding.message,

              patientAllergyId:
                finding.patientAllergyId ==
                null
                  ? null
                  : toObjectId(
                      finding.patientAllergyId,
                      'patientAllergyId',
                    ),

              conflictingPrescriptionId:
                finding.conflictingPrescriptionId ==
                null
                  ? null
                  : toObjectId(
                      finding.conflictingPrescriptionId,
                      'conflictingPrescriptionId',
                    ),

              conflictingPrescriptionItemId:
                finding.conflictingPrescriptionItemId ==
                null
                  ? null
                  : toObjectId(
                      finding.conflictingPrescriptionItemId,
                      'conflictingPrescriptionItemId',
                    ),

              externalReferenceId:
                finding.externalReferenceId,

              detectedAt,

              detectedBy:
                toObjectId(
                  actorUserId,
                  'actorUserId',
                ),

              transactionId,

              correlationId,

              schemaVersion:
                1,

              version:
                0,

              createdBy:
                toObjectId(
                  actorUserId,
                  'actorUserId',
                ),
            },

            $set: {
              status:
                'OPEN',

              acknowledgedAt:
                null,

              acknowledgedBy:
                null,

              acknowledgementReason:
                null,

              overriddenAt:
                null,

              overriddenBy:
                null,

              overrideReason:
                null,

              resolvedAt:
                null,

              resolvedBy:
                null,

              resolutionReason:
                null,

              updatedBy:
                toObjectId(
                  actorUserId,
                  'actorUserId',
                ),
            },
          },
          {
            upsert:
              true,

            runValidators:
              true,
          },
        )
          .exec();
      } catch (error) {
        throwMappedFormularyPrescriptionPersistenceError(
          error,
          'CREATE_PRESCRIPTION_WARNING',
        );
      }
    }

    return this.listForPrescription(
      facilityId,
      prescriptionId,
      true,
    );
  }

  public async listForPrescription(
    facilityId: string,
    prescriptionId: string,
    includeSensitiveMessage: boolean,
  ): Promise<PrescriptionSafetyWarningRecord[]> {
    const projection =
      includeSensitiveMessage
        ? PRESCRIPTION_WARNING_CONTENT_SELECT
        : PRESCRIPTION_WARNING_CONTENT_SELECT
            .split(' ')
            .filter(
              (field) =>
                ![
                  '+message',
                  '+acknowledgementReason',
                  '+overrideReason',
                  '+resolutionReason',
                  '+externalReferenceId',
                ].includes(field),
            )
            .join(' ');

    return record<PrescriptionSafetyWarningRecord[]>(
      await PrescriptionSafetyWarningModel.find({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        prescriptionId:
          toObjectId(
            prescriptionId,
            'prescriptionId',
          ),
      })
        .select(
          projection,
        )
        .sort({
          severity:
            -1,

          detectedAt:
            1,
        })
        .lean()
        .exec(),
    );
  }

  public async acknowledge(
    facilityId: string,
    warningId: string,
    expectedVersion: number,
    actorUserId: string,
    reason: string,
    override: boolean,
    occurredAt: Date,
  ): Promise<PrescriptionSafetyWarningRecord | null> {
    return record<PrescriptionSafetyWarningRecord | null>(
      await PrescriptionSafetyWarningModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              warningId,
              'warningId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          status: {
            $in: [
              'OPEN',
              'ACKNOWLEDGED',
            ],
          },

          version:
            expectedVersion,
        },
        {
          $set: {
            status:
              override
                ? 'OVERRIDDEN'
                : 'ACKNOWLEDGED',

            acknowledgedAt:
              occurredAt,

            acknowledgedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),

            acknowledgementReason:
              reason,

            overriddenAt:
              override
                ? occurredAt
                : null,

            overriddenBy:
              override
                ? toObjectId(
                    actorUserId,
                    'actorUserId',
                  )
                : null,

            overrideReason:
              override
                ? reason
                : null,

            updatedBy:
              toObjectId(
                actorUserId,
                'actorUserId',
              ),
          },

          $inc: {
            version:
              1,
          },
        },
        {
          new:
            true,

          runValidators:
            true,
        },
      )
        .select(
          PRESCRIPTION_WARNING_CONTENT_SELECT,
        )
        .lean()
        .exec(),
    );
  }
}
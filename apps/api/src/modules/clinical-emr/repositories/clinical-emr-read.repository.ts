import type {
  Db,
  Filter,
} from '@hospital-mis/database';

import {
  toObjectId,
} from '@hospital-mis/database';

export interface ClinicalEmrReadPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ClinicalTimelineReadEntry {
  id: string;
  entryType:
    | 'ENCOUNTER'
    | 'CLINICAL_NOTE'
    | 'DIAGNOSIS'
    | 'PROBLEM'
    | 'ALLERGY'
    | 'VITAL_SIGNS'
    | 'REFERRAL';
  patientId: string;
  encounterId: string | null;
  occurredAt: string;
  status: string;
  title: string;
  providerId: string | null;
  confidentiality: string;
  sourceVersion: number;
}

const sensitiveKeys = new Set([
  'narrativeText',
  'structuredData',
  'reason',
  'clinicalQuestion',
  'responseSummary',
  'decisionReason',
  'correctionReason',
  'restrictionReason',
  'signatureDigest',
  'evidence',
  'summary',
  'notes',
  'reactions',
  'ciphertext',
  'encryptedSnapshot',
]);

function serialized(
  value: unknown,
  includeSensitive = false,
): unknown {
  if (value == null) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === 'object' &&
    'toHexString' in value &&
    typeof value.toHexString === 'function'
  ) {
    return value.toHexString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serialized(item, includeSensitive));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => includeSensitive || !sensitiveKeys.has(key))
        .map(([key, nested]) => [
          key === '_id' ? 'id' : key,
          serialized(nested, includeSensitive),
        ]),
    );
  }

  return value;
}

function pageResult<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): ClinicalEmrReadPage<T> {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages:
      totalItems === 0
        ? 0
        : Math.ceil(totalItems / pageSize),
  };
}

function dateRange(
  from?: Date,
  to?: Date,
): Record<string, Date> | undefined {
  if (from === undefined && to === undefined) {
    return undefined;
  }

  return {
    ...(from === undefined ? {} : { $gte: from }),
    ...(to === undefined ? {} : { $lte: to }),
  };
}

export class ClinicalEmrReadRepository {
  public constructor(
    private readonly database: Db,
  ) {}

  public async findEncounterById(
    facilityId: string,
    encounterId: string,
  ): Promise<Record<string, any> | null> {
    const record =
      await this.database
        .collection('encounters')
        .findOne({
          _id: toObjectId(encounterId, 'encounterId'),
          facilityId: toObjectId(facilityId, 'facilityId'),
        });

    return record == null
      ? null
      : serialized(record) as Record<string, any>;
  }

  public async findClinicalNoteById(
    facilityId: string,
    clinicalNoteId: string,
    includeClinicalContent: boolean,
  ): Promise<Record<string, any> | null> {
    const projection =
      includeClinicalContent
        ? {
            signatureDigest: 0,
          }
        : {
            narrativeText: 0,
            structuredData: 0,
            restrictionReason: 0,
            amendmentReason: 0,
            correctionReason: 0,
            enteredInErrorReason: 0,
            signatureDigest: 0,
          };

    const record =
      await this.database
        .collection('clinicalNotes')
        .findOne(
          {
            _id: toObjectId(clinicalNoteId, 'clinicalNoteId'),
            facilityId: toObjectId(facilityId, 'facilityId'),
          },
          {
            projection,
          },
        );

    return record == null
      ? null
      : serialized(record, includeClinicalContent) as Record<string, any>;
  }

  public async listEncounters(
    facilityId: string,
    query: {
      page: number;
      pageSize: number;
      patientId?: string;
      providerId?: string;
      departmentId?: string;
      clinicId?: string;
      servicePointId?: string;
      encounterType?: string;
      careContext?: string;
      status?: string;
      serviceDateFrom?: string;
      serviceDateTo?: string;
      sortBy: string;
      sortDirection: 'asc' | 'desc';
    },
  ): Promise<ClinicalEmrReadPage<Record<string, any>>> {
    const filter: Filter<Record<string, unknown>> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.patientId === undefined
        ? {}
        : {
            patientId: toObjectId(query.patientId, 'patientId'),
          }),
      ...(query.providerId === undefined
        ? {}
        : {
            assignedProviderIds: toObjectId(query.providerId, 'providerId'),
          }),
      ...(query.departmentId === undefined
        ? {}
        : {
            departmentId: toObjectId(query.departmentId, 'departmentId'),
          }),
      ...(query.clinicId === undefined
        ? {}
        : {
            clinicId: toObjectId(query.clinicId, 'clinicId'),
          }),
      ...(query.servicePointId === undefined
        ? {}
        : {
            servicePointId:
              toObjectId(query.servicePointId, 'servicePointId'),
          }),
      ...(query.encounterType === undefined
        ? {}
        : {
            encounterType: query.encounterType,
          }),
      ...(query.careContext === undefined
        ? {}
        : {
            careContext: query.careContext,
          }),
      ...(query.status === undefined
        ? {}
        : {
            status: query.status,
          }),
      ...(
        query.serviceDateFrom === undefined &&
        query.serviceDateTo === undefined
          ? {}
          : {
              serviceDate: {
                ...(query.serviceDateFrom === undefined
                  ? {}
                  : {
                      $gte: query.serviceDateFrom,
                    }),
                ...(query.serviceDateTo === undefined
                  ? {}
                  : {
                      $lte: query.serviceDateTo,
                    }),
              },
            }
      ),
    };

    const collection =
      this.database.collection('encounters');

    const [records, totalItems] =
      await Promise.all([
        collection
          .find(filter, {
            projection: {
              restrictionReason: 0,
              signatureDigest: 0,
              cancellationReason: 0,
              correctionReason: 0,
              activeContextKey: 0,
            },
          })
          .sort({
            [query.sortBy]: query.sortDirection === 'asc' ? 1 : -1,
            _id: 1,
          })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .toArray(),
        collection.countDocuments(filter),
      ]);

    return pageResult(
      records.map((record) =>
        serialized(record) as Record<string, any>,
      ),
      query.page,
      query.pageSize,
      totalItems,
    );
  }

  public async listClinicalNotes(
    facilityId: string,
    query: {
      page: number;
      pageSize: number;
      encounterId?: string;
      patientId?: string;
      authorProviderId?: string;
      documentType?: string;
      status?: string;
      confidentiality?: string;
      sortBy: string;
      sortDirection: 'asc' | 'desc';
    },
  ): Promise<ClinicalEmrReadPage<Record<string, any>>> {
    const filter: Record<string, unknown> = {
      facilityId: toObjectId(facilityId, 'facilityId'),
      ...(query.encounterId === undefined
        ? {}
        : {
            encounterId: toObjectId(query.encounterId, 'encounterId'),
          }),
      ...(query.patientId === undefined
        ? {}
        : {
            patientId: toObjectId(query.patientId, 'patientId'),
          }),
      ...(query.authorProviderId === undefined
        ? {}
        : {
            authorProviderId:
              toObjectId(query.authorProviderId, 'authorProviderId'),
          }),
      ...(query.documentType === undefined
        ? {}
        : {
            documentType: query.documentType,
          }),
      ...(query.status === undefined
        ? {}
        : {
            status: query.status,
          }),
      ...(query.confidentiality === undefined
        ? {}
        : {
            confidentiality: query.confidentiality,
          }),
    };

    const collection =
      this.database.collection('clinicalNotes');

    const [records, totalItems] =
      await Promise.all([
        collection
          .find(filter, {
            projection: {
              narrativeText: 0,
              structuredData: 0,
              restrictionReason: 0,
              signatureDigest: 0,
              amendmentReason: 0,
              correctionReason: 0,
              enteredInErrorReason: 0,
            },
          })
          .sort({
            [query.sortBy]: query.sortDirection === 'asc' ? 1 : -1,
            _id: 1,
          })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .toArray(),
        collection.countDocuments(filter),
      ]);

    return pageResult(
      records.map((record) =>
        serialized(record) as Record<string, any>,
      ),
      query.page,
      query.pageSize,
      totalItems,
    );
  }

  public async patientSummary(
    facilityId: string,
    patientId: string,
    encounterLimit: number,
  ): Promise<Record<string, unknown>> {
    const facilityObjectId =
      toObjectId(facilityId, 'facilityId');
    const patientObjectId =
      toObjectId(patientId, 'patientId');

    const [
      patient,
      encounters,
      problems,
      allergies,
      latestVitalSigns,
      referralVersions,
    ] = await Promise.all([
      this.database
        .collection('patients')
        .findOne(
          {
            _id: patientObjectId,
            facilityId: facilityObjectId,
          },
          {
            projection: {
              encryptedCnic: 0,
              encryptedBForm: 0,
              searchTokens: 0,
              sensitiveSnapshot: 0,
            },
          },
        ),
      this.database
        .collection('encounters')
        .find({
          facilityId: facilityObjectId,
          patientId: patientObjectId,
        }, {
          projection: {
            restrictionReason: 0,
            signatureDigest: 0,
            cancellationReason: 0,
            correctionReason: 0,
            activeContextKey: 0,
          },
        })
        .sort({
          startedAt: -1,
        })
        .limit(encounterLimit)
        .toArray(),
      this.database
        .collection('patientProblems')
        .find({
          facilityId: facilityObjectId,
          patientId: patientObjectId,
          status: 'ACTIVE',
        }, {
          projection: {
            summary: 0,
            statusReason: 0,
            activeProblemKey: 0,
          },
        })
        .sort({
          recordedAt: -1,
        })
        .toArray(),
      this.database
        .collection('patientAllergies')
        .find({
          facilityId: facilityObjectId,
          patientId: patientObjectId,
          status: 'ACTIVE',
        }, {
          projection: {
            reactions: 0,
            notes: 0,
            statusReason: 0,
            activeAllergyKey: 0,
          },
        })
        .sort({
          severity: -1,
          recordedAt: -1,
        })
        .toArray(),
      this.database
        .collection('vitalSigns')
        .find({
          facilityId: facilityObjectId,
          patientId: patientObjectId,
          status: 'ACTIVE',
        }, {
          projection: {
            notes: 0,
            correctionReason: 0,
            enteredInErrorReason: 0,
            restrictionReason: 0,
          },
        })
        .sort({
          measuredAt: -1,
        })
        .limit(1)
        .toArray(),
      this.database
        .collection('clinicalReferrals')
        .aggregate([
          {
            $match: {
              facilityId: facilityObjectId,
              patientId: patientObjectId,
            },
          },
          {
            $sort: {
              referralNumber: 1,
              referralVersion: -1,
            },
          },
          {
            $group: {
              _id: '$referralNumber',
              record: {
                $first: '$$ROOT',
              },
            },
          },
          {
            $replaceRoot: {
              newRoot: '$record',
            },
          },
          {
            $sort: {
              changedAt: -1,
            },
          },
          {
            $limit: 20,
          },
          {
            $project: {
              reason: 0,
              clinicalQuestion: 0,
              responseSummary: 0,
              decisionReason: 0,
              correctionReason: 0,
            },
          },
        ])
        .toArray(),
    ]);

    return {
      patient:
        patient == null ? null : serialized(patient),
      encounters: serialized(encounters),
      activeProblems: serialized(problems),
      activeAllergies: serialized(allergies),
      latestVitalSigns:
        latestVitalSigns[0] == null
          ? null
          : serialized(latestVitalSigns[0]),
      referrals: serialized(referralVersions),
    };
  }

  public async providerWorklist(
    facilityId: string,
    providerId: string,
    query: {
      page: number;
      pageSize: number;
      serviceDate?: string;
      status?: string;
    },
  ): Promise<ClinicalEmrReadPage<Record<string, any>>> {
    const facilityObjectId =
      toObjectId(facilityId, 'facilityId');
    const providerObjectId =
      toObjectId(providerId, 'providerId');

    const filter: Record<string, unknown> = {
      facilityId: facilityObjectId,
      assignedProviderIds: providerObjectId,
      ...(query.serviceDate === undefined
        ? {}
        : {
            serviceDate: query.serviceDate,
          }),
      ...(query.status === undefined
        ? {
            status: {
              $in: [
                'CREATED',
                'IN_PROGRESS',
                'ON_HOLD',
                'COMPLETED',
                'SIGNED',
              ],
            },
          }
        : {
            status: query.status,
          }),
    };

    const collection =
      this.database.collection('encounters');

    const [encounters, totalItems] =
      await Promise.all([
        collection
          .find(filter, {
            projection: {
              restrictionReason: 0,
              signatureDigest: 0,
              cancellationReason: 0,
              correctionReason: 0,
              activeContextKey: 0,
            },
          })
          .sort({
            serviceDate: 1,
            startedAt: 1,
          })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .toArray(),
        collection.countDocuments(filter),
      ]);

    return pageResult(
      encounters.map((record) =>
        serialized(record) as Record<string, any>,
      ),
      query.page,
      query.pageSize,
      totalItems,
    );
  }


  public async vitalSignHistory(
    facilityId: string,
    vitalSignId: string,
  ): Promise<Record<string, any>[]> {
    const facilityObjectId =
      toObjectId(facilityId, 'facilityId');
    const collection =
      this.database.collection('vitalSigns');
    const seed =
      await collection.findOne({
        _id: toObjectId(vitalSignId, 'vitalSignId'),
        facilityId: facilityObjectId,
      });

    if (seed === null) {
      return [];
    }

    const chain = new Map<string, Record<string, unknown>>();
    let cursor: Record<string, any> | null = seed;

    while (cursor !== null && chain.size < 100) {
      const cursorId = String(cursor._id);
      if (chain.has(cursorId)) {
        break;
      }

      chain.set(cursorId, cursor);
      const previousId = cursor.supersedesVitalSignId;
      cursor =
        previousId == null
          ? null
          : await collection.findOne({
              _id: previousId,
              facilityId: facilityObjectId,
            });
    }

    cursor = seed;

    while (cursor !== null && chain.size < 100) {
      const nextId = cursor.supersededByVitalSignId;
      if (nextId == null) {
        break;
      }

      const next =
        await collection.findOne({
          _id: nextId,
          facilityId: facilityObjectId,
        });

      if (next === null || chain.has(String(next._id))) {
        break;
      }

      chain.set(String(next._id), next);
      cursor = next;
    }

    return [...chain.values()]
      .sort(
        (left, right) =>
          new Date(String(left.createdAt)).getTime() -
          new Date(String(right.createdAt)).getTime(),
      )
      .map(
        (record) =>
          serialized(record, true) as Record<string, any>,
      );
  }

  public async timeline(
    facilityId: string,
    patientId: string,
    options: {
      dateFrom?: Date;
      dateTo?: Date;
      includeEnteredInError: boolean;
      encounterType?: string;
      sortDirection?: 'asc' | 'desc';
      limit: number;
    },
  ): Promise<ClinicalTimelineReadEntry[]> {
    const facilityObjectId =
      toObjectId(facilityId, 'facilityId');
    const patientObjectId =
      toObjectId(patientId, 'patientId');
    const range =
      dateRange(options.dateFrom, options.dateTo);
    const timelineDirection =
      options.sortDirection === 'asc' ? 1 : -1;

    const common = {
      facilityId: facilityObjectId,
      patientId: patientObjectId,
    };

    const matchingEncounterIds =
      options.encounterType === undefined
        ? null
        : await this.database
            .collection('encounters')
            .distinct('_id', {
              ...common,
              encounterType: options.encounterType,
            });

    const encounterConstraint =
      (field: 'encounterId' | 'sourceEncounterId') =>
        matchingEncounterIds === null
          ? {}
          : {
              [field]: {
                $in: matchingEncounterIds,
              },
            };

    const [
      encounters,
      notes,
      diagnoses,
      problems,
      allergies,
      vitalSigns,
      referrals,
    ] = await Promise.all([
      this.database.collection('encounters').find({
        ...common,
        ...(options.encounterType === undefined
          ? {}
          : { encounterType: options.encounterType }),
        ...(range === undefined ? {} : { startedAt: range }),
      }, {
        projection: {
          _id: 1,
          patientId: 1,
          encounterNumber: 1,
          encounterType: 1,
          status: 1,
          startedAt: 1,
          currentOwnerId: 1,
          confidentiality: 1,
          version: 1,
        },
      })
        .sort({
          startedAt: timelineDirection,
          _id: timelineDirection,
        })
        .limit(options.limit)
        .toArray(),
      this.database.collection('clinicalNotes').find({
        ...common,
        ...encounterConstraint('encounterId'),
        ...(
          options.includeEnteredInError
            ? {}
            : {
                status: {
                  $ne: 'ENTERED_IN_ERROR',
                },
              }
        ),
        ...(range === undefined ? {} : { createdAt: range }),
      }, {
        projection: {
          _id: 1,
          patientId: 1,
          encounterId: 1,
          documentType: 1,
          status: 1,
          createdAt: 1,
          authorProviderId: 1,
          confidentiality: 1,
          version: 1,
        },
      })
        .sort({
          createdAt: timelineDirection,
          _id: timelineDirection,
        })
        .limit(options.limit)
        .toArray(),
      this.database.collection('encounterDiagnoses').find({
        ...common,
        ...encounterConstraint('encounterId'),
        ...(
          options.includeEnteredInError
            ? {}
            : {
                status: {
                  $ne: 'ENTERED_IN_ERROR',
                },
              }
        ),
        ...(range === undefined ? {} : { recordedAt: range }),
      }, {
        projection: {
          _id: 1,
          patientId: 1,
          encounterId: 1,
          display: 1,
          status: 1,
          recordedAt: 1,
          recordedBy: 1,
          version: 1,
        },
      })
        .sort({
          recordedAt: timelineDirection,
          _id: timelineDirection,
        })
        .limit(options.limit)
        .toArray(),
      this.database.collection('patientProblems').find({
        ...common,
        ...encounterConstraint('sourceEncounterId'),
        ...(
          options.includeEnteredInError
            ? {}
            : {
                status: {
                  $ne: 'ENTERED_IN_ERROR',
                },
              }
        ),
        ...(range === undefined ? {} : { recordedAt: range }),
      }, {
        projection: {
          _id: 1,
          patientId: 1,
          sourceEncounterId: 1,
          display: 1,
          status: 1,
          recordedAt: 1,
          recordedBy: 1,
          version: 1,
        },
      })
        .sort({
          recordedAt: timelineDirection,
          _id: timelineDirection,
        })
        .limit(options.limit)
        .toArray(),
      this.database.collection('patientAllergies').find({
        ...common,
        ...encounterConstraint('sourceEncounterId'),
        ...(
          options.includeEnteredInError
            ? {}
            : {
                status: {
                  $ne: 'ENTERED_IN_ERROR',
                },
              }
        ),
        ...(range === undefined ? {} : { recordedAt: range }),
      }, {
        projection: {
          _id: 1,
          patientId: 1,
          sourceEncounterId: 1,
          allergenText: 1,
          recordType: 1,
          status: 1,
          recordedAt: 1,
          recordedBy: 1,
          version: 1,
        },
      })
        .sort({
          recordedAt: timelineDirection,
          _id: timelineDirection,
        })
        .limit(options.limit)
        .toArray(),
      this.database.collection('vitalSigns').find({
        ...common,
        ...encounterConstraint('encounterId'),
        ...(
          options.includeEnteredInError
            ? {}
            : {
                status: {
                  $ne: 'ENTERED_IN_ERROR',
                },
              }
        ),
        ...(range === undefined ? {} : { measuredAt: range }),
      }, {
        projection: {
          _id: 1,
          patientId: 1,
          encounterId: 1,
          status: 1,
          measuredAt: 1,
          recordedBy: 1,
          confidentiality: 1,
          version: 1,
        },
      })
        .sort({
          measuredAt: timelineDirection,
          _id: timelineDirection,
        })
        .limit(options.limit)
        .toArray(),
      this.database.collection('clinicalReferrals').aggregate([
        {
          $match: {
            ...common,
            ...encounterConstraint('sourceEncounterId'),
            ...(range === undefined ? {} : { changedAt: range }),
          },
        },
        {
          $sort: {
            referralNumber: 1,
            referralVersion: -1,
          },
        },
        {
          $group: {
            _id: '$referralNumber',
            record: {
              $first: '$$ROOT',
            },
          },
        },
        {
          $replaceRoot: {
            newRoot: '$record',
          },
        },
        {
          $sort: {
            changedAt: timelineDirection,
            _id: timelineDirection,
          },
        },
        {
          $limit: options.limit,
        },
      ]).toArray(),
    ]);

    const entries: ClinicalTimelineReadEntry[] = [
      ...encounters.map((record) => ({
        id: String(record._id),
        entryType: 'ENCOUNTER' as const,
        patientId: String(record.patientId),
        encounterId: String(record._id),
        occurredAt: new Date(record.startedAt).toISOString(),
        status: String(record.status),
        title: `${String(record.encounterType)} encounter ${String(record.encounterNumber)}`,
        providerId: record.currentOwnerId == null ? null : String(record.currentOwnerId),
        confidentiality: String(record.confidentiality ?? 'ROUTINE'),
        sourceVersion: Number(record.version ?? 0),
      })),
      ...notes.map((record) => ({
        id: String(record._id),
        entryType: 'CLINICAL_NOTE' as const,
        patientId: String(record.patientId),
        encounterId: String(record.encounterId),
        occurredAt: new Date(record.createdAt).toISOString(),
        status: String(record.status),
        title: String(record.documentType),
        providerId: String(record.authorProviderId),
        confidentiality: String(record.confidentiality ?? 'ROUTINE'),
        sourceVersion: Number(record.version ?? 0),
      })),
      ...diagnoses.map((record) => ({
        id: String(record._id),
        entryType: 'DIAGNOSIS' as const,
        patientId: String(record.patientId),
        encounterId: String(record.encounterId),
        occurredAt: new Date(record.recordedAt).toISOString(),
        status: String(record.status),
        title: String(record.display),
        providerId: String(record.recordedBy),
        confidentiality: 'ROUTINE',
        sourceVersion: Number(record.version ?? 0),
      })),
      ...problems.map((record) => ({
        id: String(record._id),
        entryType: 'PROBLEM' as const,
        patientId: String(record.patientId),
        encounterId: String(record.sourceEncounterId),
        occurredAt: new Date(record.recordedAt).toISOString(),
        status: String(record.status),
        title: String(record.display),
        providerId: String(record.recordedBy),
        confidentiality: 'ROUTINE',
        sourceVersion: Number(record.version ?? 0),
      })),
      ...allergies.map((record) => ({
        id: String(record._id),
        entryType: 'ALLERGY' as const,
        patientId: String(record.patientId),
        encounterId:
          record.sourceEncounterId == null
            ? null
            : String(record.sourceEncounterId),
        occurredAt: new Date(record.recordedAt).toISOString(),
        status: String(record.status),
        title:
          record.recordType === 'ALLERGY'
            ? String(record.allergenText)
            : String(record.recordType),
        providerId: String(record.recordedBy),
        confidentiality: 'ROUTINE',
        sourceVersion: Number(record.version ?? 0),
      })),
      ...vitalSigns.map((record) => ({
        id: String(record._id),
        entryType: 'VITAL_SIGNS' as const,
        patientId: String(record.patientId),
        encounterId: String(record.encounterId),
        occurredAt: new Date(record.measuredAt).toISOString(),
        status: String(record.status),
        title: 'Vital signs and measurements',
        providerId: String(record.recordedBy),
        confidentiality: String(record.confidentiality ?? 'ROUTINE'),
        sourceVersion: Number(record.version ?? 0),
      })),
      ...referrals.map((record) => ({
        id: String(record._id),
        entryType: 'REFERRAL' as const,
        patientId: String(record.patientId),
        encounterId: String(record.sourceEncounterId),
        occurredAt: new Date(record.changedAt).toISOString(),
        status: String(record.status),
        title: `${String(record.referralType)} ${String(record.referralNumber)}`,
        providerId:
          record.assignedProviderId == null
            ? String(record.requestingProviderId)
            : String(record.assignedProviderId),
        confidentiality: 'ROUTINE',
        sourceVersion: Number(record.version ?? 0),
      })),
    ];

    return entries
      .sort(
        (left, right) =>
          timelineDirection *
          left.occurredAt.localeCompare(right.occurredAt),
      )
      .slice(0, options.limit);
  }
}
import type {
  FilterQuery,
} from 'mongoose';

import {
  NursingAssessmentModel,
  NursingAssessmentVersionModel,
  NursingCarePlanModel,
  NursingCarePlanVersionModel,
  NursingTaskModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  NursingAssessmentListQuery,
  NursingCarePlanListQuery,
  NursingTaskListQuery,
} from '../nursing-medication.contracts.js';

import type {
  NursingAssessmentPersistenceUpdate,
  NursingAssessmentRepositoryPort,
  NursingCarePlanPersistenceUpdate,
  NursingCareRepositoryPort,
  NursingTaskPersistenceUpdate,
} from '../nursing-medication.ports.js';

import type {
  NursingAssessmentRecord,
  NursingAssessmentVersionRecord,
  NursingCarePlanRecord,
  NursingCarePlanVersionRecord,
  NursingTaskRecord,
} from '../nursing-medication.persistence.types.js';

const ASSESSMENT_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'assessmentNumber',
  'assessmentType',
  'templateCode',
  'templateVersion',
  'sections',
  '+sections.narrative',
  '+summary',
  'overallRiskLevel',
  'requiresEscalation',
  '+escalationReason',
  'assessedAt',
  'recordedAt',
  '+backdatedEntryReason',
  'assessedByUserId',
  'assessedByStaffId',
  'status',
  'signedAt',
  'signedByUserId',
  'signedByStaffId',
  'revisionNumber',
  'rootAssessmentId',
  'supersedesAssessmentId',
  'supersededByAssessmentId',
  '+correctionReason',
  'enteredInErrorAt',
  'enteredInErrorByUserId',
  'enteredInErrorByStaffId',
  '+enteredInErrorReason',
  'transactionId',
  'correlationId',
  'idempotencyKey',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const CARE_PLAN_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'carePlanNumber',
  'title',
  'status',
  'problems',
  '+problems.description',
  '+problems.goals.description',
  '+problems.goals.expectedOutcome',
  '+problems.goals.evaluation',
  '+problems.interventions.description',
  'assignedNurseStaffId',
  'assignedTeamCode',
  'startedAt',
  'targetCompletionAt',
  'nextReviewAt',
  'lastReviewedAt',
  'lastReviewedByStaffId',
  '+outcomeEvaluation',
  'completedAt',
  'completedByStaffId',
  '+cancellationReason',
  'revisionNumber',
  'rootCarePlanId',
  'supersedesCarePlanId',
  'supersededByCarePlanId',
  '+correctionReason',
  'transactionId',
  'correlationId',
  'idempotencyKey',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

const TASK_SELECT = [
  '_id',
  'facilityId',
  'admissionId',
  'patientId',
  'encounterId',
  'wardId',
  'roomId',
  'bedId',
  'taskNumber',
  'sourceType',
  'sourceRecordId',
  'carePlanId',
  'carePlanInterventionId',
  'title',
  '+instructions',
  'priority',
  'status',
  'assignedStaffId',
  'assignedTeamCode',
  'scheduledAt',
  'dueAt',
  'recurrenceKey',
  'carriedForwardFromTaskId',
  'carriedForwardToTaskId',
  'startedAt',
  'completedAt',
  'completedByUserId',
  'completedByStaffId',
  'dispositionReasonCode',
  '+dispositionReason',
  'escalatedAt',
  'escalatedToStaffId',
  '+escalationReason',
  'transactionId',
  'correlationId',
  'idempotencyKey',
  'schemaVersion',
  'version',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
].join(' ');

function record<T>(
  value: unknown,
): T {
  return value as T;
}

function direction(
  value:
    | 'asc'
    | 'desc',
): 1 | -1 {
  return value ===
    'asc'
    ? 1
    : -1;
}

function assessmentFilter(
  facilityId: string,
  query: NursingAssessmentListQuery,
): FilterQuery<NursingAssessmentRecord> {
  const filter:
    FilterQuery<NursingAssessmentRecord> = {
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    };

  if (
    query.admissionId !==
    undefined
  ) {
    filter.admissionId =
      toObjectId(
        query.admissionId,
        'admissionId',
      );
  }

  if (
    query.patientId !==
    undefined
  ) {
    filter.patientId =
      toObjectId(
        query.patientId,
        'patientId',
      );
  }

  if (
    query.wardId !==
    undefined
  ) {
    filter.wardId =
      toObjectId(
        query.wardId,
        'wardId',
      );
  }

  if (
    query.assessmentType !==
    undefined
  ) {
    filter.assessmentType =
      query.assessmentType;
  }

  if (
    query.status !==
    undefined
  ) {
    filter.status =
      query.status;
  }

  if (
    query.riskLevel !==
    undefined
  ) {
    filter.overallRiskLevel =
      query.riskLevel;
  }

  if (
    query.assessedFrom !==
      undefined ||
    query.assessedTo !==
      undefined
  ) {
    filter.assessedAt = {};

    if (
      query.assessedFrom !==
      undefined
    ) {
      filter.assessedAt.$gte =
        new Date(
          query.assessedFrom,
        );
    }

    if (
      query.assessedTo !==
      undefined
    ) {
      filter.assessedAt.$lte =
        new Date(
          query.assessedTo,
        );
    }
  }

  return filter;
}

function carePlanFilter(
  facilityId: string,
  query: NursingCarePlanListQuery,
): FilterQuery<NursingCarePlanRecord> {
  const filter:
    FilterQuery<NursingCarePlanRecord> = {
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    };

  if (
    query.admissionId !==
    undefined
  ) {
    filter.admissionId =
      toObjectId(
        query.admissionId,
        'admissionId',
      );
  }

  if (
    query.patientId !==
    undefined
  ) {
    filter.patientId =
      toObjectId(
        query.patientId,
        'patientId',
      );
  }

  if (
    query.wardId !==
    undefined
  ) {
    filter.wardId =
      toObjectId(
        query.wardId,
        'wardId',
      );
  }

  if (
    query.assignedNurseStaffId !==
    undefined
  ) {
    filter.assignedNurseStaffId =
      toObjectId(
        query.assignedNurseStaffId,
        'assignedNurseStaffId',
      );
  }

  if (
    query.status !==
    undefined
  ) {
    filter.status =
      query.status;
  }

  if (
    query.reviewDueBefore !==
    undefined
  ) {
    filter.nextReviewAt = {
      $ne: null,

      $lte:
        new Date(
          query.reviewDueBefore,
        ),
    };
  }

  return filter;
}

function taskFilter(
  facilityId: string,
  query: NursingTaskListQuery,
): FilterQuery<NursingTaskRecord> {
  const filter:
    FilterQuery<NursingTaskRecord> = {
      facilityId:
        toObjectId(
          facilityId,
          'facilityId',
        ),
    };

  if (
    query.admissionId !==
    undefined
  ) {
    filter.admissionId =
      toObjectId(
        query.admissionId,
        'admissionId',
      );
  }

  if (
    query.patientId !==
    undefined
  ) {
    filter.patientId =
      toObjectId(
        query.patientId,
        'patientId',
      );
  }

  if (
    query.wardId !==
    undefined
  ) {
    filter.wardId =
      toObjectId(
        query.wardId,
        'wardId',
      );
  }

  if (
    query.assignedStaffId !==
    undefined
  ) {
    filter.assignedStaffId =
      toObjectId(
        query.assignedStaffId,
        'assignedStaffId',
      );
  }

  if (
    query.sourceType !==
    undefined
  ) {
    filter.sourceType =
      query.sourceType;
  }

  if (
    query.status !==
    undefined
  ) {
    filter.status =
      query.status;
  }

  if (
    query.priority !==
    undefined
  ) {
    filter.priority =
      query.priority;
  }

  if (
    query.dueFrom !==
      undefined ||
    query.dueTo !==
      undefined ||
    query.overdueAt !==
      undefined
  ) {
    filter.dueAt = {};

    if (
      query.dueFrom !==
      undefined
    ) {
      filter.dueAt.$gte =
        new Date(
          query.dueFrom,
        );
    }

    if (
      query.dueTo !==
      undefined
    ) {
      filter.dueAt.$lte =
        new Date(
          query.dueTo,
        );
    }

    if (
      query.overdueAt !==
      undefined
    ) {
      filter.dueAt.$lt =
        new Date(
          query.overdueAt,
        );

      filter.status = {
        $in: [
          'PENDING',
          'IN_PROGRESS',
          'DELAYED',
          'ESCALATED',
        ],
      };
    }
  }

  return filter;
}

export class NursingAssessmentRepository
implements NursingAssessmentRepositoryPort {
  public async create(
    input: Omit<
      NursingAssessmentRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<NursingAssessmentRecord> {
    const created =
      await NursingAssessmentModel.create(
        input,
      );

    return record<NursingAssessmentRecord>(
      await NursingAssessmentModel.findById(
        created._id,
      )
        .select(
          ASSESSMENT_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findById(
    facilityId: string,
    assessmentId: string,
  ): Promise<NursingAssessmentRecord | null> {
    return record<
      NursingAssessmentRecord | null
    >(
      await NursingAssessmentModel.findOne({
        _id:
          toObjectId(
            assessmentId,
            'assessmentId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          ASSESSMENT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async list(
    facilityId: string,
    query: NursingAssessmentListQuery,
  ): Promise<{
    items: NursingAssessmentRecord[];
    total: number;
  }> {
    const filter =
      assessmentFilter(
        facilityId,
        query,
      );

    const sort = {
      [query.sortBy]:
        direction(
          query.sortDirection,
        ),

      _id:
        direction(
          query.sortDirection,
        ),
    };

    const [
      items,
      total,
    ] = await Promise.all([
      NursingAssessmentModel.find(
        filter,
      )
        .select(
          ASSESSMENT_SELECT,
        )
        .sort(sort)
        .skip(
          (
            query.page - 1
          ) *
            query.pageSize,
        )
        .limit(
          query.pageSize,
        )
        .lean()
        .exec(),

      NursingAssessmentModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items:
        record<
          NursingAssessmentRecord[]
        >(items),

      total,
    };
  }

  public async update(
    facilityId: string,
    assessmentId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly NursingAssessmentRecord['status'][],
    update:
      NursingAssessmentPersistenceUpdate,
  ): Promise<NursingAssessmentRecord | null> {
    return record<
      NursingAssessmentRecord | null
    >(
      await NursingAssessmentModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              assessmentId,
              'assessmentId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,

          status: {
            $in:
              allowedStatuses,
          },
        },
        {
          $set:
            update,

          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(
          ASSESSMENT_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createVersion(
    input: Omit<
      NursingAssessmentVersionRecord,
      '_id' | 'createdAt'
    >,
  ): Promise<NursingAssessmentVersionRecord> {
    const created =
      await NursingAssessmentVersionModel.create(
        input,
      );

    return record<
      NursingAssessmentVersionRecord
    >(
      await NursingAssessmentVersionModel.findById(
        created._id,
      )
        .select(
          '+snapshot +reason',
        )
        .lean()
        .orFail()
        .exec(),
    );
  }
}

export class NursingCareRepository
implements NursingCareRepositoryPort {
  public async createCarePlan(
    input: Omit<
      NursingCarePlanRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<NursingCarePlanRecord> {
    const created =
      await NursingCarePlanModel.create(
        input,
      );

    return record<NursingCarePlanRecord>(
      await NursingCarePlanModel.findById(
        created._id,
      )
        .select(
          CARE_PLAN_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findCarePlanById(
    facilityId: string,
    carePlanId: string,
  ): Promise<NursingCarePlanRecord | null> {
    return record<
      NursingCarePlanRecord | null
    >(
      await NursingCarePlanModel.findOne({
        _id:
          toObjectId(
            carePlanId,
            'carePlanId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          CARE_PLAN_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listCarePlans(
    facilityId: string,
    query: NursingCarePlanListQuery,
  ): Promise<{
    items: NursingCarePlanRecord[];
    total: number;
  }> {
    const filter =
      carePlanFilter(
        facilityId,
        query,
      );

    const sort = {
      [query.sortBy]:
        direction(
          query.sortDirection,
        ),

      _id:
        direction(
          query.sortDirection,
        ),
    };

    const [
      items,
      total,
    ] = await Promise.all([
      NursingCarePlanModel.find(
        filter,
      )
        .select(
          CARE_PLAN_SELECT,
        )
        .sort(sort)
        .skip(
          (
            query.page - 1
          ) *
            query.pageSize,
        )
        .limit(
          query.pageSize,
        )
        .lean()
        .exec(),

      NursingCarePlanModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items:
        record<
          NursingCarePlanRecord[]
        >(items),

      total,
    };
  }

  public async updateCarePlan(
    facilityId: string,
    carePlanId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly NursingCarePlanRecord['status'][],
    update:
      NursingCarePlanPersistenceUpdate,
  ): Promise<NursingCarePlanRecord | null> {
    return record<
      NursingCarePlanRecord | null
    >(
      await NursingCarePlanModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              carePlanId,
              'carePlanId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,

          status: {
            $in:
              allowedStatuses,
          },
        },
        {
          $set:
            update,

          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(
          CARE_PLAN_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async createCarePlanVersion(
    input: Omit<
      NursingCarePlanVersionRecord,
      '_id' | 'createdAt'
    >,
  ): Promise<NursingCarePlanVersionRecord> {
    const created =
      await NursingCarePlanVersionModel.create(
        input,
      );

    return record<
      NursingCarePlanVersionRecord
    >(
      await NursingCarePlanVersionModel.findById(
        created._id,
      )
        .select(
          '+snapshot +reason',
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async createTask(
    input: Omit<
      NursingTaskRecord,
      '_id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<NursingTaskRecord> {
    const created =
      await NursingTaskModel.create(
        input,
      );

    return record<NursingTaskRecord>(
      await NursingTaskModel.findById(
        created._id,
      )
        .select(
          TASK_SELECT,
        )
        .lean()
        .orFail()
        .exec(),
    );
  }

  public async findTaskById(
    facilityId: string,
    taskId: string,
  ): Promise<NursingTaskRecord | null> {
    return record<
      NursingTaskRecord | null
    >(
      await NursingTaskModel.findOne({
        _id:
          toObjectId(
            taskId,
            'taskId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          TASK_SELECT,
        )
        .lean()
        .exec(),
    );
  }

  public async listTasks(
    facilityId: string,
    query: NursingTaskListQuery,
  ): Promise<{
    items: NursingTaskRecord[];
    total: number;
  }> {
    const filter =
      taskFilter(
        facilityId,
        query,
      );

    const sort = {
      [query.sortBy]:
        direction(
          query.sortDirection,
        ),

      _id:
        direction(
          query.sortDirection,
        ),
    };

    const [
      items,
      total,
    ] = await Promise.all([
      NursingTaskModel.find(
        filter,
      )
        .select(
          TASK_SELECT,
        )
        .sort(sort)
        .skip(
          (
            query.page - 1
          ) *
            query.pageSize,
        )
        .limit(
          query.pageSize,
        )
        .lean()
        .exec(),

      NursingTaskModel.countDocuments(
        filter,
      ).exec(),
    ]);

    return {
      items:
        record<
          NursingTaskRecord[]
        >(items),

      total,
    };
  }

  public async updateTask(
    facilityId: string,
    taskId: string,
    expectedVersion: number,
    allowedStatuses:
      readonly NursingTaskRecord['status'][],
    update:
      NursingTaskPersistenceUpdate,
  ): Promise<NursingTaskRecord | null> {
    return record<
      NursingTaskRecord | null
    >(
      await NursingTaskModel.findOneAndUpdate(
        {
          _id:
            toObjectId(
              taskId,
              'taskId',
            ),

          facilityId:
            toObjectId(
              facilityId,
              'facilityId',
            ),

          version:
            expectedVersion,

          status: {
            $in:
              allowedStatuses,
          },
        },
        {
          $set:
            update,

          $inc: {
            version: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
        .select(
          TASK_SELECT,
        )
        .lean()
        .exec(),
    );
  }
}
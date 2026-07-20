import {
  Decimal128,
  ObjectId,
} from 'mongodb';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  AdmissionRecommendationModel,
} from '../models/admission-recommendation.model.js';

import {
  AdmissionModel,
  AdmissionStatusHistoryModel,
} from '../models/admission.model.js';

import {
  BedRateModel,
  BedRateVersionModel,
} from '../models/bed-rate.model.js';

import {
  AdmissionBedAssignmentModel,
  BedChargeSegmentModel,
  BedHoldModel,
  BedStatusHistoryModel,
} from '../models/inpatient-bed-operation.model.js';

import {
  BedModel,
  RoomModel,
  WardModel,
} from '../models/inpatient-location.model.js';

function actorFields(
  actorId: ObjectId,
) {
  return {
    createdBy: actorId,
    updatedBy: actorId,
  };
}

function transactionFields() {
  return {
    transactionId:
      `tx-${new ObjectId().toHexString()}`,

    correlationId:
      `corr-${new ObjectId().toHexString()}`,
  };
}

function lifecycleFields(
  actorId: ObjectId,
) {
  return {
    status: 'ACTIVE' as const,
    activatedAt: new Date(),
    activatedBy: actorId,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
  };
}

function restrictionFields() {
  return {
    permittedSexes: [
      'MALE',
      'FEMALE',
      'OTHER',
      'UNKNOWN',
    ] as const,

    minimumAgeYears: null,
    maximumAgeYears: null,

    specialtyCodes: [
      'internal medicine',
    ],

    isolationCapabilities: [
      'STANDARD_PRECAUTIONS',
    ] as const,

    infectionControlTags: [],

    negativePressureCapable:
      false,

    cohortingAllowed: true,
  };
}

function indexNames(
  indexes:
    ReturnType<
      typeof BedModel.schema.indexes
    >,
): string[] {
  return indexes.flatMap(
    ([, options]) =>
      typeof options.name ===
      'string'
        ? [options.name]
        : [],
  );
}

function chargingPolicy() {
  return {
    policyCode: 'standard day',

    billingUnit:
      'PER_24_HOURS' as const,

    partialDayPolicy:
      'ROUND_TO_INCREMENT' as const,

    sameDayDischargePolicy:
      'MINIMUM_ONE_UNIT' as const,

    transferChargingPolicy:
      'SPLIT_AT_TRANSFER_TIME' as const,

    roundingIncrementMinutes: 60,
    minimumChargeMinutes: 60,

    dayBoundaryTimezone:
      'Asia/Karachi',

    dayBoundaryHour: 0,
    gracePeriodMinutes: 15,
  };
}

describe(
  'inpatient database foundation models',
  () => {
    it(
      'defines facility-safe configuration and conflict-prevention indexes',
      () => {
        expect(
          indexNames(
            WardModel.schema.indexes(),
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_wards_facility_code',
            'uq_wards_facility_name',
          ]),
        );

        expect(
          indexNames(
            RoomModel.schema.indexes(),
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_rooms_ward_code',
            'uq_rooms_ward_number',
          ]),
        );

        expect(
          indexNames(
            BedModel.schema.indexes(),
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_beds_facility_code',
            'uq_beds_room_number',
            'ix_beds_live_ward_map',
          ]),
        );

        expect(
          indexNames(
            AdmissionBedAssignmentModel
              .schema
              .indexes(),
          ),
        ).toEqual(
          expect.arrayContaining([
            'uq_admission_bed_assignments_active_bed',
            'uq_admission_bed_assignments_active_admission',
            'uq_admission_bed_assignments_sequence',
          ]),
        );

        expect(
          indexNames(
            BedHoldModel.schema.indexes(),
          ),
        ).toContain(
          'uq_bed_holds_active_bed',
        );

        expect(
          indexNames(
            BedChargeSegmentModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_bed_charge_segments_open_assignment',
        );
      },
    );

    it(
      'normalizes ward, room, and bed identifiers and rejects inconsistent occupancy projections',
      async () => {
        const facilityId =
          new ObjectId();

        const actorId =
          new ObjectId();

        const departmentId =
          new ObjectId();

        const servicePointId =
          new ObjectId();

        const now = new Date();

        const ward =
          new WardModel({
            facilityId,

            wardCode:
              ' med ward 1 ',

            name:
              ' Medical Ward One ',

            normalizedName:
              'placeholder',

            wardType: 'GENERAL',
            departmentId,
            servicePointId,

            nursingStationCode:
              ' station 1 ',

            description:
              'Fictional general medical ward',

            displayOrder: 1,

            ...restrictionFields(),
            ...lifecycleFields(
              actorId,
            ),
            ...transactionFields(),
            ...actorFields(actorId),
          });

        await expect(
          ward.validate(),
        ).resolves.toBeUndefined();

        expect(
          ward.wardCode,
        ).toBe('MED_WARD_1');

        expect(
          ward.normalizedName,
        ).toBe(
          'medical ward one',
        );

        expect(
          ward.specialtyCodes,
        ).toEqual([
          'INTERNAL_MEDICINE',
        ]);

        const room =
          new RoomModel({
            facilityId,
            wardId: ward._id,
            departmentId,
            servicePointId,

            roomCode:
              ' room 101 ',

            roomNumber:
              ' 101-a ',

            name:
              ' Room 101 A ',

            normalizedName:
              'placeholder',

            roomType:
              'GENERAL_WARD',

            roomClass: 'GENERAL',
            capacity: 4,

            floorCode:
              ' first floor ',

            description: null,
            displayOrder: 1,

            ...restrictionFields(),
            ...lifecycleFields(
              actorId,
            ),
            ...transactionFields(),
            ...actorFields(actorId),
          });

        await expect(
          room.validate(),
        ).resolves.toBeUndefined();

        expect(
          room.roomCode,
        ).toBe('ROOM_101');

        expect(
          room.roomNumber,
        ).toBe('101-A');

        const bed =
          new BedModel({
            facilityId,
            wardId: ward._id,
            roomId: room._id,
            departmentId,
            servicePointId,

            bedCode:
              ' med-101-a-bed-1 ',

            bedNumber:
              ' bed 1 ',

            label: ' Bed One ',

            normalizedLabel:
              'placeholder',

            bedCategory: 'GENERAL',

            operationalStatus:
              'AVAILABLE',

            operationalStatusChangedAt:
              now,

            operationalStatusChangedBy:
              actorId,

            operationalStatusReasonCode:
              ' activated ',

            operationalStatusReason:
              null,

            currentAdmissionId:
              null,

            currentAssignmentId:
              null,

            activeHoldId: null,
            currentPatientId: null,
            lastReleasedAt: null,

            turnaroundRequiredAfterRelease:
              true,

            maintenanceReference:
              null,

            displayOrder: 1,

            ...restrictionFields(),
            ...lifecycleFields(
              actorId,
            ),
            ...transactionFields(),
            ...actorFields(actorId),
          });

        await expect(
          bed.validate(),
        ).resolves.toBeUndefined();

        expect(
          bed.bedCode,
        ).toBe(
          'MED-101-A-BED-1',
        );

        expect(
          bed.bedNumber,
        ).toBe('BED_1');

        bed.operationalStatus =
          'OCCUPIED';

        await expect(
          bed.validate(),
        ).rejects.toThrow(
          'Occupied beds require admission',
        );
      },
    );

    it(
      'validates effective-dated decimal bed rates and immutable versions',
      async () => {
        const facilityId =
          new ObjectId();

        const actorId =
          new ObjectId();

        const bedId =
          new ObjectId();

        const effectiveFrom =
          new Date(
            '2026-07-01T00:00:00.000Z',
          );

        const rate =
          new BedRateModel({
            facilityId,

            rateCode:
              ' general bed standard ',

            name:
              'General Bed Standard Rate',

            scope: 'BED',

            scopeKey:
              `bed:${bedId.toHexString()}`,

            scopeReferenceId:
              bedId,

            scopeCode: null,
            currencyCode: 'pkr',

            amount:
              Decimal128.fromString(
                '7500.00',
              ),

            chargingPolicy:
              chargingPolicy(),

            chargeCatalogItemId:
              new ObjectId(),

            priceListId: null,

            payerOrganizationId:
              null,

            panelPlanId: null,

            treatmentPackageId:
              null,

            effectiveFrom,
            effectiveThrough: null,

            status: 'DRAFT',
            currentVersion: 0,
            latestVersionId: null,
            activatedAt: null,
            activatedBy: null,
            supersededAt: null,
            supersededBy: null,
            supersededByRateId:
              null,
            cancelledAt: null,
            cancelledBy: null,
            cancellationReason:
              null,

            ...transactionFields(),
            ...actorFields(actorId),
          });

        await expect(
          rate.validate(),
        ).resolves.toBeUndefined();

        expect(
          rate.rateCode,
        ).toBe(
          'GENERAL_BED_STANDARD',
        );

        expect(
          rate.currencyCode,
        ).toBe('PKR');

        expect(
          rate
            .chargingPolicy
            .policyCode,
        ).toBe('STANDARD_DAY');

        const version =
          new BedRateVersionModel({
            facilityId,
            bedRateId: rate._id,
            versionNumber: 1,
            previousVersionId:
              null,

            changeType:
              'ACTIVATED',

            rateCodeSnapshot:
              rate.rateCode,

            nameSnapshot:
              rate.name,

            scopeSnapshot:
              rate.scope,

            scopeKeySnapshot:
              rate.scopeKey,

            scopeReferenceIdSnapshot:
              bedId,

            scopeCodeSnapshot:
              null,

            currencyCodeSnapshot:
              rate.currencyCode,

            amountSnapshot:
              rate.amount,

            chargingPolicySnapshot:
              chargingPolicy(),

            chargeCatalogItemIdSnapshot:
              rate
                .chargeCatalogItemId,

            priceListIdSnapshot:
              null,

            payerOrganizationIdSnapshot:
              null,

            panelPlanIdSnapshot:
              null,

            treatmentPackageIdSnapshot:
              null,

            effectiveFromSnapshot:
              effectiveFrom,

            effectiveThroughSnapshot:
              null,

            statusSnapshot:
              'ACTIVE',

            snapshotHash:
              'c'.repeat(64),

            changeReason:
              'Initial activation',

            recordedAt: new Date(),
            recordedBy: actorId,

            ...transactionFields(),
            ...actorFields(actorId),
          });

        await expect(
          version.validate(),
        ).resolves.toBeUndefined();

        expect(
          indexNames(
            BedRateVersionModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_bed_rate_versions_rate_version',
        );
      },
    );

    it(
      'validates recommendation, admission, histories, holds, assignments, and charge segments',
      async () => {
        const facilityId =
          new ObjectId();

        const actorId =
          new ObjectId();

        const staffId =
          new ObjectId();

        const patientId =
          new ObjectId();

        const encounterId =
          new ObjectId();

        const departmentId =
          new ObjectId();

        const wardId =
          new ObjectId();

        const roomId =
          new ObjectId();

        const bedId =
          new ObjectId();

        const now = new Date();

        const recommendation =
          new AdmissionRecommendationModel(
            {
              facilityId,

              recommendationNumber:
                ' ip-rec-0001 ',

              patientId,
              requestedPatientId:
                patientId,

              canonicalRedirected:
                false,

              encounterId,

              registrationId:
                new ObjectId(),

              opdVisitId:
                new ObjectId(),

              queueTokenId:
                new ObjectId(),

              orderingProviderUserId:
                actorId,

              orderingProviderStaffId:
                staffId,

              orderingDepartmentId:
                departmentId,

              orderingServicePointId:
                new ObjectId(),

              admissionType:
                'EMERGENCY',

              priority: 'URGENT',

              requestedWardTypes: [
                'GENERAL',
              ],

              requestedSpecialtyCodes:
                [
                  ' internal medicine ',
                ],

              requestedIsolationCapabilities:
                [],

              clinicalIndication:
                'Fictional indication requiring inpatient observation',

              diagnosisSnapshots: [
                {
                  diagnosisId:
                    new ObjectId(),

                  diagnosisCode:
                    ' j18.9 ',

                  diagnosisSystem:
                    ' icd-10 ',

                  diagnosisDisplay:
                    'Fictional pneumonia diagnosis',

                  primary: true,
                },
              ],

              expectedLengthOfStayDays:
                3,

              requestedAdmissionAt:
                now,

              recommendedAt: now,
              status: 'ORDERED',

              expiresAt:
                new Date(
                  now.getTime() +
                    86_400_000,
                ),

              attachmentIds: [],

              ...transactionFields(),
              ...actorFields(
                actorId,
              ),
            },
          );

        await expect(
          recommendation.validate(),
        ).resolves.toBeUndefined();

        expect(
          recommendation
            .requestedSpecialtyCodes,
        ).toEqual([
          'INTERNAL_MEDICINE',
        ]);

        const admission =
          new AdmissionModel({
            facilityId,

            admissionNumber:
              ' ipd-2026-000001 ',

            admissionRecommendationId:
              recommendation._id,

            patientId,
            requestedPatientId:
              patientId,

            canonicalRedirected:
              false,

            encounterId,

            registrationId:
              recommendation
                .registrationId,

            opdVisitId:
              recommendation
                .opdVisitId,

            queueTokenId:
              recommendation
                .queueTokenId,

            admittingDepartmentId:
              departmentId,

            admittingServicePointId:
              new ObjectId(),

            admissionType:
              'EMERGENCY',

            priority: 'URGENT',

            status:
              'PENDING_ACCEPTANCE',

            isActive: true,
            requestedAt: now,

            attendingConsultantUserId:
              actorId,

            attendingConsultantStaffId:
              staffId,

            careTeam: [],

            clinicalIndicationSnapshot:
              'Fictional indication requiring inpatient observation',

            diagnosisSnapshots: [
              {
                diagnosisId:
                  new ObjectId(),

                diagnosisCode:
                  'J18.9',

                diagnosisSystem:
                  'ICD-10',

                diagnosisDisplay:
                  'Fictional pneumonia diagnosis',

                primary: true,
              },
            ],

            guardianSnapshot: null,

            emergencyContactSnapshot:
              null,

            currentStatusSequence:
              1,

            ...transactionFields(),
            ...actorFields(actorId),
          });

        await expect(
          admission.validate(),
        ).resolves.toBeUndefined();

        expect(
          admission.admissionNumber,
        ).toBe(
          'IPD-2026-000001',
        );

        const admissionHistory =
          new AdmissionStatusHistoryModel(
            {
              facilityId,
              admissionId:
                admission._id,

              patientId,
              sequence: 1,
              fromStatus: null,

              toStatus:
                'PENDING_ACCEPTANCE',

              changeType: 'CREATED',

              reasonCode:
                ' admission created ',

              reason: null,
              occurredAt: now,

              performedBy: actorId,

              performedByStaffId:
                staffId,

              ...transactionFields(),
              ...actorFields(
                actorId,
              ),
            },
          );

        await expect(
          admissionHistory.validate(),
        ).resolves.toBeUndefined();

        const hold =
          new BedHoldModel({
            facilityId,

            holdNumber:
              ' hold-0001 ',

            bedId,
            roomId,
            wardId,

            admissionId:
              admission._id,

            admissionRecommendationId:
              null,

            patientId,

            holdType:
              'ADMISSION_RESERVATION',

            status: 'ACTIVE',
            isActive: true,
            heldAt: now,

            expiresAt:
              new Date(
                now.getTime() +
                  30 * 60_000,
              ),

            heldBy: actorId,
            heldByStaffId:
              staffId,

            reasonCode:
              ' admission allocation ',

            reason:
              'Fictional pending bed allocation',

            ...transactionFields(),
            ...actorFields(actorId),
          });

        await expect(
          hold.validate(),
        ).resolves.toBeUndefined();

        const assignment =
          new AdmissionBedAssignmentModel(
            {
              facilityId,

              assignmentNumber:
                ' assign-0001 ',

              admissionId:
                admission._id,

              patientId,
              sequence: 1,

              assignmentType:
                'INITIAL',

              status: 'ACTIVE',
              isActive: true,
              wardId,
              roomId,
              bedId,

              wardCodeSnapshot:
                'med ward',

              wardNameSnapshot:
                'Medical Ward',

              roomCodeSnapshot:
                'room 101',

              roomNumberSnapshot:
                '101',

              bedCodeSnapshot:
                'bed 101 a',

              bedNumberSnapshot:
                '1',

              bedCategorySnapshot:
                'general',

              bedHoldId: hold._id,

              previousAssignmentId:
                null,

              assignedAt: now,
              assignedBy: actorId,

              assignedByStaffId:
                staffId,

              turnaroundRequired:
                true,

              ...transactionFields(),
              ...actorFields(
                actorId,
              ),
            },
          );

        await expect(
          assignment.validate(),
        ).resolves.toBeUndefined();

        const bedHistory =
          new BedStatusHistoryModel(
            {
              facilityId,
              bedId,
              wardId,
              roomId,
              sequence: 1,
              fromStatus: null,

              toStatus:
                'OCCUPIED',

              reasonCode:
                'OCCUPIED',

              admissionId:
                admission._id,

              admissionBedAssignmentId:
                assignment._id,

              bedHoldId: hold._id,
              occurredAt: now,
              performedBy: actorId,

              performedByStaffId:
                staffId,

              ...transactionFields(),
              ...actorFields(
                actorId,
              ),
            },
          );

        await expect(
          bedHistory.validate(),
        ).resolves.toBeUndefined();

        const charge =
          new BedChargeSegmentModel(
            {
              facilityId,

              segmentNumber:
                ' bed-charge-0001 ',

              admissionId:
                admission._id,

              admissionBedAssignmentId:
                assignment._id,

              patientId,
              wardId,
              roomId,
              bedId,

              bedRateId:
                new ObjectId(),

              bedRateVersionId:
                new ObjectId(),

              bedRateVersionNumber:
                1,

              rateCodeSnapshot:
                'general standard',

              currencyCode: 'pkr',

              unitRate:
                Decimal128.fromString(
                  '7500.00',
                ),

              chargingPolicySnapshot:
                chargingPolicy(),

              startedAt: now,
              endedAt: null,
              isOpen: true,
              status: 'OPEN',

              ...transactionFields(),
              ...actorFields(
                actorId,
              ),
            },
          );

        await expect(
          charge.validate(),
        ).resolves.toBeUndefined();

        expect(
          charge.rateCodeSnapshot,
        ).toBe(
          'GENERAL_STANDARD',
        );

        expect(
          indexNames(
            AdmissionStatusHistoryModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_admission_status_histories_sequence',
        );

        expect(
          indexNames(
            BedStatusHistoryModel
              .schema
              .indexes(),
          ),
        ).toContain(
          'uq_bed_status_histories_sequence',
        );
      },
    );
  },
);
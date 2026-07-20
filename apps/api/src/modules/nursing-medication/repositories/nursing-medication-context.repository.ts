import {
  AdmissionBedAssignmentModel,
  AdmissionModel,
  BedModel,
  PatientAlertModel,
  PatientAllergyModel,
  PatientIdentifierModel,
  PatientModel,
  RoomModel,
  StaffModel,
  UserModel,
  WardModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  NursingContextActorIdentityRecord,
  NursingContextAdmissionRecord,
  NursingContextAlertRecord,
  NursingContextAllergyRecord,
  NursingContextBedRecord,
  NursingContextLocationAssignmentRecord,
  NursingContextPatientRecord,
  NursingContextRoomRecord,
  NursingContextStaffRecord,
  NursingContextWardRecord,
  NursingMedicationContextRepositoryPort,
} from '../nursing-medication.ports.js';

function id(
  value:
    | {
        toHexString(): string;
      }
    | null,
): string | null {
  return value?.toHexString() ?? null;
}

export class NursingMedicationContextRepository
implements NursingMedicationContextRepositoryPort {
  public async findActorIdentity(
    userId: string,
  ): Promise<
    NursingContextActorIdentityRecord | null
  > {
    const record =
      await UserModel.findById(
        toObjectId(
          userId,
          'userId',
        ),
      )
        .select(
          '_id facilityId staffId status',
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          facilityId:
            | {
                toHexString(): string;
              }
            | null;

          staffId:
            | {
                toHexString(): string;
              }
            | null;

          status:
            NursingContextActorIdentityRecord['status'];
        }>()
        .exec();

    return record === null
      ? null
      : {
          userId:
            record._id.toHexString(),

          facilityId:
            id(
              record.facilityId,
            ),

          staffId:
            id(
              record.staffId,
            ),

          status:
            record.status,
        };
  }

  public async findStaff(
    facilityId: string,
    staffId: string,
  ): Promise<
    NursingContextStaffRecord | null
  > {
    const record =
      await StaffModel.findOne({
        _id:
          toObjectId(
            staffId,
            'staffId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '_id facilityId departmentId displayName professionalType employmentStatus isClinical isActive',
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          facilityId: {
            toHexString(): string;
          };

          departmentId:
            | {
                toHexString(): string;
              }
            | null;

          displayName: string;

          professionalType:
            | string
            | null;

          employmentStatus:
            NursingContextStaffRecord['employmentStatus'];

          isClinical: boolean;

          isActive: boolean;
        }>()
        .exec();

    return record === null
      ? null
      : {
          staffId:
            record._id.toHexString(),

          facilityId:
            record.facilityId.toHexString(),

          departmentId:
            id(
              record.departmentId,
            ),

          displayName:
            record.displayName,

          professionalType:
            record.professionalType,

          employmentStatus:
            record.employmentStatus,

          isClinical:
            record.isClinical,

          isActive:
            record.isActive,
        };
  }

  public async findAdmission(
    facilityId: string,
    admissionId: string,
  ): Promise<
    NursingContextAdmissionRecord | null
  > {
    const record =
      await AdmissionModel.findOne({
        _id:
          toObjectId(
            admissionId,
            'admissionId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          [
            '_id',
            'facilityId',
            'admissionNumber',
            'patientId',
            'encounterId',
            'admittingDepartmentId',
            'status',
            'isActive',
            'admittedAt',
            'clinicallyDischargedAt',
            'dischargedAt',
            'attendingConsultantUserId',
            'attendingConsultantStaffId',
            'currentWardId',
            'currentRoomId',
            'currentBedId',
            'careTeam',
          ].join(' '),
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          facilityId: {
            toHexString(): string;
          };

          admissionNumber: string;

          patientId: {
            toHexString(): string;
          };

          encounterId: {
            toHexString(): string;
          };

          admittingDepartmentId: {
            toHexString(): string;
          };

          status:
            NursingContextAdmissionRecord['status'];

          isActive: boolean;

          admittedAt:
            | Date
            | null;

          clinicallyDischargedAt:
            | Date
            | null;

          dischargedAt:
            | Date
            | null;

          attendingConsultantUserId: {
            toHexString(): string;
          };

          attendingConsultantStaffId: {
            toHexString(): string;
          };

          currentWardId:
            | {
                toHexString(): string;
              }
            | null;

          currentRoomId:
            | {
                toHexString(): string;
              }
            | null;

          currentBedId:
            | {
                toHexString(): string;
              }
            | null;

          careTeam: readonly {
            userId: {
              toHexString(): string;
            };

            staffId: {
              toHexString(): string;
            };

            roleCode: string;

            assignedAt: Date;

            endedAt:
              | Date
              | null;
          }[];
        }>()
        .exec();

    return record === null
      ? null
      : {
          facilityId:
            record.facilityId.toHexString(),

          admissionId:
            record._id.toHexString(),

          admissionNumber:
            record.admissionNumber,

          patientId:
            record.patientId.toHexString(),

          encounterId:
            record.encounterId.toHexString(),

          admittingDepartmentId:
            record.admittingDepartmentId.toHexString(),

          status:
            record.status,

          isActive:
            record.isActive,

          admittedAt:
            record.admittedAt,

          clinicallyDischargedAt:
            record.clinicallyDischargedAt,

          dischargedAt:
            record.dischargedAt,

          attendingConsultantUserId:
            record.attendingConsultantUserId.toHexString(),

          attendingConsultantStaffId:
            record.attendingConsultantStaffId.toHexString(),

          currentWardId:
            id(
              record.currentWardId,
            ),

          currentRoomId:
            id(
              record.currentRoomId,
            ),

          currentBedId:
            id(
              record.currentBedId,
            ),

          careTeam:
            record.careTeam.map(
              (member) => ({
                staffId:
                  member.staffId.toHexString(),

                userId:
                  member.userId.toHexString(),

                role:
                  member.roleCode,

                startedAt:
                  member.assignedAt,

                endedAt:
                  member.endedAt,
              }),
            ),
        };
  }

  public async findLatestLocationAssignment(
    facilityId: string,
    admissionId: string,
  ): Promise<
    NursingContextLocationAssignmentRecord | null
  > {
    const record =
      await AdmissionBedAssignmentModel.findOne({
        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),

        admissionId:
          toObjectId(
            admissionId,
            'admissionId',
          ),

        status: {
          $in: [
            'ACTIVE',
            'COMPLETED',
          ],
        },
      })
        .select(
          'wardId roomId bedId',
        )
        .sort({
          sequence: -1,
          assignedAt: -1,
          _id: -1,
        })
        .lean<{
          wardId: {
            toHexString(): string;
          };

          roomId: {
            toHexString(): string;
          };

          bedId: {
            toHexString(): string;
          };
        }>()
        .exec();

    return record === null
      ? null
      : {
          wardId:
            record.wardId.toHexString(),

          roomId:
            record.roomId.toHexString(),

          bedId:
            record.bedId.toHexString(),
        };
  }

  public async findPatient(
    facilityId: string,
    patientId: string,
  ): Promise<
    NursingContextPatientRecord | null
  > {
    const record =
      await PatientModel.findOne({
        _id:
          toObjectId(
            patientId,
            'patientId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '_id facilityId displayName +birthDate.value birthDate.estimatedAgeYears sexAtBirth status',
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          facilityId: {
            toHexString(): string;
          };

          displayName: string;

          birthDate: {
            value:
              | Date
              | null;

            estimatedAgeYears:
              | number
              | null;
          };

          sexAtBirth: string;

          status: string;
        }>()
        .exec();

    return record === null
      ? null
      : {
          patientId:
            record._id.toHexString(),

          facilityId:
            record.facilityId.toHexString(),

          displayName:
            record.displayName,

          birthDate:
            record.birthDate.value,

          estimatedAgeYears:
            record.birthDate.estimatedAgeYears,

          sexAtBirth:
            record.sexAtBirth,

          status:
            record.status,
        };
  }

  public async findPrimaryMrn(
    facilityId: string,
    patientId: string,
  ): Promise<string | null> {
    const record =
      await PatientIdentifierModel.findOne({
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

        identifierType:
          'MRN',

        isPrimaryMrn:
          true,

        status:
          'ACTIVE',
      })
        .select(
          'displayValue',
        )
        .lean<{
          displayValue: string;
        }>()
        .exec();

    return record
      ?.displayValue ?? null;
  }

  public async listActiveAlerts(
    facilityId: string,
    patientId: string,
    at: Date,
  ): Promise<
    NursingContextAlertRecord[]
  > {
    const records =
      await PatientAlertModel.find({
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

        effectiveFrom: {
          $lte: at,
        },

        $or: [
          {
            effectiveTo:
              null,
          },
          {
            effectiveTo: {
              $gt: at,
            },
          },
        ],
      })
        .select(
          '_id alertType severity title +details effectiveFrom effectiveTo',
        )
        .sort({
          severity: -1,
          effectiveFrom: -1,
        })
        .lean<
          readonly {
            _id: {
              toHexString(): string;
            };

            alertType:
              NursingContextAlertRecord['alertType'];

            severity:
              NursingContextAlertRecord['severity'];

            title: string;

            details: string;

            effectiveFrom: Date;

            effectiveTo:
              | Date
              | null;
          }[]
        >()
        .exec();

    return records.map(
      (record) => ({
        alertId:
          record._id.toHexString(),

        alertType:
          record.alertType,

        severity:
          record.severity,

        title:
          record.title,

        details:
          record.details,

        effectiveFrom:
          record.effectiveFrom,

        effectiveTo:
          record.effectiveTo,
      }),
    );
  }

  public async listActiveAllergies(
    facilityId: string,
    patientId: string,
  ): Promise<
    NursingContextAllergyRecord[]
  > {
    const records =
      await PatientAllergyModel.find({
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

        recordType:
          'ALLERGY',
      })
        .select(
          '_id allergenText category severity verificationStatus reactions',
        )
        .sort({
          severity: -1,
          allergenText: 1,
        })
        .lean<
          readonly {
            _id: {
              toHexString(): string;
            };

            allergenText: string;

            category: string;

            severity: string;

            verificationStatus: string;

            reactions: readonly {
              manifestation: string;
            }[];
          }[]
        >()
        .exec();

    return records.map(
      (record) => ({
        patientAllergyId:
          record._id.toHexString(),

        allergenText:
          record.allergenText,

        category:
          record.category,

        severity:
          record.severity,

        verificationStatus:
          record.verificationStatus,

        reactions:
          record.reactions.map(
            (reaction) =>
              reaction.manifestation,
          ),
      }),
    );
  }

  public async findWard(
    facilityId: string,
    wardId: string,
  ): Promise<
    NursingContextWardRecord | null
  > {
    const record =
      await WardModel.findOne({
        _id:
          toObjectId(
            wardId,
            'wardId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '_id facilityId wardCode name wardType departmentId nursingStationCode status',
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          facilityId: {
            toHexString(): string;
          };

          wardCode: string;

          name: string;

          wardType: string;

          departmentId: {
            toHexString(): string;
          };

          nursingStationCode:
            | string
            | null;

          status: string;
        }>()
        .exec();

    return record === null
      ? null
      : {
          wardId:
            record._id.toHexString(),

          facilityId:
            record.facilityId.toHexString(),

          wardCode:
            record.wardCode,

          name:
            record.name,

          wardType:
            record.wardType,

          departmentId:
            record.departmentId.toHexString(),

          nursingStationCode:
            record.nursingStationCode,

          status:
            record.status,
        };
  }

  public async findRoom(
    facilityId: string,
    roomId: string,
  ): Promise<
    NursingContextRoomRecord | null
  > {
    const record =
      await RoomModel.findOne({
        _id:
          toObjectId(
            roomId,
            'roomId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '_id facilityId wardId roomNumber name status',
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          facilityId: {
            toHexString(): string;
          };

          wardId: {
            toHexString(): string;
          };

          roomNumber: string;

          name: string;

          status: string;
        }>()
        .exec();

    return record === null
      ? null
      : {
          roomId:
            record._id.toHexString(),

          facilityId:
            record.facilityId.toHexString(),

          wardId:
            record.wardId.toHexString(),

          roomNumber:
            record.roomNumber,

          name:
            record.name,

          status:
            record.status,
        };
  }

  public async findBed(
    facilityId: string,
    bedId: string,
  ): Promise<
    NursingContextBedRecord | null
  > {
    const record =
      await BedModel.findOne({
        _id:
          toObjectId(
            bedId,
            'bedId',
          ),

        facilityId:
          toObjectId(
            facilityId,
            'facilityId',
          ),
      })
        .select(
          '_id facilityId wardId roomId bedNumber label bedCategory operationalStatus currentAdmissionId +currentPatientId',
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          facilityId: {
            toHexString(): string;
          };

          wardId: {
            toHexString(): string;
          };

          roomId: {
            toHexString(): string;
          };

          bedNumber: string;

          label: string;

          bedCategory: string;

          operationalStatus: string;

          currentAdmissionId:
            | {
                toHexString(): string;
              }
            | null;

          currentPatientId:
            | {
                toHexString(): string;
              }
            | null;
        }>()
        .exec();

    return record === null
      ? null
      : {
          bedId:
            record._id.toHexString(),

          facilityId:
            record.facilityId.toHexString(),

          wardId:
            record.wardId.toHexString(),

          roomId:
            record.roomId.toHexString(),

          bedNumber:
            record.bedNumber,

          label:
            record.label,

          bedCategory:
            record.bedCategory,

          operationalStatus:
            record.operationalStatus,

          currentAdmissionId:
            id(
              record.currentAdmissionId,
            ),

          currentPatientId:
            id(
              record.currentPatientId,
            ),
        };
  }
}
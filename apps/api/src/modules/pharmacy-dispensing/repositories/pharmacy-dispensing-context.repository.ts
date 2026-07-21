import {
  AdmissionModel,
  EncounterModel,
  PatientIdentifierModel,
  PatientModel,
  StaffModel,
  StoreLocationModel,
  UserModel,
  WardModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  PharmacyDispensingContextRepositoryPort,
} from '../pharmacy-dispensing.ports.js';

import type {
  PharmacyActorIdentityRecord,
  PharmacyAdmissionRecord,
  PharmacyEncounterRecord,
  PharmacyLocationRecord,
  PharmacyPatientRecord,
  PharmacyStaffRecord,
  PharmacyWardRecord,
} from '../pharmacy-dispensing.persistence.types.js';

export class PharmacyDispensingContextRepository
implements PharmacyDispensingContextRepositoryPort {
  public async findActorIdentity(
    userId: string,
  ): Promise<PharmacyActorIdentityRecord | null> {
    const user = await UserModel.findById(
      toObjectId(userId, 'userId'),
    )
      .select('_id facilityId staffId status')
      .lean()
      .exec();

    if (user === null) {
      return null;
    }

    return {
      userId: user._id.toHexString(),
      facilityId: user.facilityId?.toHexString() ?? null,
      staffId: user.staffId?.toHexString() ?? null,
      status: user.status,
    };
  }

  public async findStaff(
    facilityId: string,
    staffId: string,
  ): Promise<PharmacyStaffRecord | null> {
    const staff = await StaffModel.findOne({
      _id: toObjectId(staffId, 'staffId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId departmentId displayName professionalType employmentStatus isActive',
      )
      .lean()
      .exec();

    if (staff === null) {
      return null;
    }

    return {
      staffId: staff._id.toHexString(),
      facilityId: staff.facilityId.toHexString(),
      departmentId: staff.departmentId?.toHexString() ?? null,
      displayName: staff.displayName,
      professionalType: staff.professionalType ?? null,
      employmentStatus: staff.employmentStatus,
      isActive: staff.isActive,
    };
  }

  public async findPatient(
    facilityId: string,
    patientId: string,
  ): Promise<PharmacyPatientRecord | null> {
    const objectPatientId = toObjectId(patientId, 'patientId');
    const [patient, mrn] = await Promise.all([
      PatientModel.findOne({
        _id: objectPatientId,
        facilityId: toObjectId(facilityId, 'facilityId'),
      })
        .select(
          '_id facilityId status displayName birthDate.precision birthDate.estimatedAgeYears +birthDate.value sexAtBirth',
        )
        .lean()
        .exec(),
      PatientIdentifierModel.findOne({
        facilityId: toObjectId(facilityId, 'facilityId'),
        patientId: objectPatientId,
        identifierType: 'MRN',
        isPrimaryMrn: true,
        status: 'ACTIVE',
      })
        .select('+normalizedValue displayValue')
        .lean()
        .exec(),
    ]);

    if (patient === null) {
      return null;
    }

    const birthDateValue = patient.birthDate.value;

    return {
      patientId: patient._id.toHexString(),
      facilityId: patient.facilityId.toHexString(),
      status: patient.status,
      mrn: mrn?.displayValue ?? mrn?.normalizedValue ?? null,
      displayName: patient.displayName,
      dateOfBirth: birthDateValue ?? null,
      birthDatePrecision: patient.birthDate.precision,
      estimatedAgeYears: patient.birthDate.estimatedAgeYears ?? null,
      sexAtBirth: patient.sexAtBirth,
    };
  }

  public async findEncounter(
    facilityId: string,
    encounterId: string,
  ): Promise<PharmacyEncounterRecord | null> {
    const encounter = await EncounterModel.findOne({
      _id: toObjectId(encounterId, 'encounterId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId patientId departmentId servicePointId primaryProviderId status',
      )
      .lean()
      .exec();

    if (encounter === null) {
      return null;
    }

    return {
      encounterId: encounter._id.toHexString(),
      facilityId: encounter.facilityId.toHexString(),
      patientId: encounter.patientId.toHexString(),
      departmentId: encounter.departmentId.toHexString(),
      servicePointId: encounter.servicePointId?.toHexString() ?? null,
      providerId: encounter.primaryProviderId.toHexString(),
      status: encounter.status,
    };
  }

  public async findAdmission(
    facilityId: string,
    admissionId: string,
  ): Promise<PharmacyAdmissionRecord | null> {
    const admission = await AdmissionModel.findOne({
      _id: toObjectId(admissionId, 'admissionId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId patientId encounterId currentWardId status isActive',
      )
      .lean()
      .exec();

    if (admission === null) {
      return null;
    }

    return {
      admissionId: admission._id.toHexString(),
      facilityId: admission.facilityId.toHexString(),
      patientId: admission.patientId.toHexString(),
      encounterId: admission.encounterId?.toHexString() ?? null,
      wardId: admission.currentWardId?.toHexString() ?? null,
      status: admission.isActive ? admission.status : 'INACTIVE',
    };
  }

  public async findWard(
    facilityId: string,
    wardId: string,
  ): Promise<PharmacyWardRecord | null> {
    const ward = await WardModel.findOne({
      _id: toObjectId(wardId, 'wardId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select('_id facilityId departmentId name status')
      .lean()
      .exec();

    if (ward === null) {
      return null;
    }

    return {
      wardId: ward._id.toHexString(),
      facilityId: ward.facilityId.toHexString(),
      departmentId: ward.departmentId.toHexString(),
      name: ward.name,
      status: ward.status,
    };
  }

  public async findLocation(
    facilityId: string,
    locationId: string,
  ): Promise<PharmacyLocationRecord | null> {
    const location = await StoreLocationModel.findOne({
      _id: toObjectId(locationId, 'locationId'),
      facilityId: toObjectId(facilityId, 'facilityId'),
    })
      .select(
        '_id facilityId locationCode name locationType departmentId wardId servicePointId supportsDispensing allowsControlledMedicine allowsGeneralStock status',
      )
      .lean()
      .exec();

    if (location === null) {
      return null;
    }

    return {
      locationId: location._id.toHexString(),
      facilityId: location.facilityId.toHexString(),
      locationCode: location.locationCode,
      name: location.name,
      locationType: location.locationType,
      departmentId: location.departmentId?.toHexString() ?? null,
      wardId: location.wardId?.toHexString() ?? null,
      servicePointId: location.servicePointId?.toHexString() ?? null,
      supportsDispensing: location.supportsDispensing,
      allowsControlledMedicine: location.allowsControlledMedicine,
      allowsGeneralStock: location.allowsGeneralStock,
      status: location.status,
    };
  }
}
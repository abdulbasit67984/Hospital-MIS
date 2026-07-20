import mongoose, {
  Schema,
} from 'mongoose';

import {
  collectionSpecs,
  type HospitalCollectionName,
} from '../catalog/collection-specs.js';

import {
  accessControlSchemas,
} from './access-control.js';

import {
  auditSchemas,
} from './audit.js';

import {
  authSchemas,
} from './auth.js';

import {
  criticalSchemas,
} from './critical.js';

import {
  facilityConfigurationSchemas,
} from './facility-configuration.js';

import {
  guardianSchema,
} from './guardian.model.js';

import {
  patientGuardianSchema,
} from './patient-guardian.model.js';

import {
  patientIdentifierSchema,
} from './patient-identifier.model.js';

import {
  patientSchema,
} from './patient.model.js';

import {
  patientMergeSchema,
} from './patient-merge.model.js';

import {
  patientAddressSchema,
  patientAlertSchema,
  patientContactSchema,
} from './patient-profile.model.js';

import {
  opdClinicSchema,
  servicePointSchema,
} from './opd-context.model.js';

import {
  opdVisitSchema,
} from './opd-visit.model.js';

import {
  queueDefinitionSchema,
  queueStatusHistorySchema,
  queueTokenSchema,
  serviceCounterSchema,
} from './queue.model.js';

import {
  registrationSchema,
} from './registration.model.js';

import {
  allergySchema,
  patientAllergySchema,
  patientAllergyVersionSchema,
} from './allergy.model.js';

import {
  clinicalReferralSchema,
} from './clinical-referral.model.js';

import {
  clinicalNoteSchema,
  clinicalNoteVersionSchema,
} from './clinical-note.model.js';

import {
  diagnosisSchema,
  encounterDiagnosisSchema,
  patientProblemSchema,
  patientProblemVersionSchema,
} from './diagnosis.model.js';

import {
  encounterSchema,
  encounterStatusHistorySchema,
} from './encounter.model.js';

import {
  vitalSignSchema,
} from './vital-sign.model.js';

import {
  formularyItemSchema,
  medicineFormSchema,
  medicineRouteSchema,
  medicineSchema,
  medicineStrengthSchema,
  prescriptionFrequencySchema,
  unitOfMeasureSchema,
} from './medicine-catalog.model.js';

import {
  prescriptionItemSchema,
  prescriptionSafetyWarningSchema,
  prescriptionSchema,
  prescriptionStatusHistorySchema,
} from './prescription.model.js';

import {
  labTestCategorySchema,
  labTestSchema,
} from './laboratory-catalog.model.js';

import {
  labOrderItemSchema,
  labOrderSchema,
  labOrderStatusHistorySchema,
} from './laboratory-order.model.js';

import {
  labSpecimenSchema,
  labSpecimenStatusHistorySchema,
} from './laboratory-specimen.model.js';

import {
  labResultSchema,
  labResultVersionSchema,
} from './laboratory-result.model.js';

import {
  labCriticalResultCommunicationSchema,
} from './laboratory-critical-result-communication.model.js';

import {
  radiologyModalitySchema,
  radiologyProcedureSchema,
} from './radiology-catalog.model.js';

import {
  radiologyOrderItemSchema,
  radiologyOrderItemStatusHistorySchema,
  radiologyOrderSchema,
  radiologyOrderStatusHistorySchema,
} from './radiology-order.model.js';

import {
  radiologyAppointmentSchema,
  radiologyExaminationSchema,
  radiologyImagingSeriesSchema,
  radiologyImagingStudySchema,
  radiologyResourceReservationSchema,
  radiologyResourceSchema,
  radiologySafetyScreeningSchema,
} from './radiology-operations.model.js';

import {
  radiologyCriticalFindingCommunicationSchema,
  radiologyReportSchema,
  radiologyReportVersionSchema,
} from './radiology-report.model.js';

import {
  admissionRecommendationSchema,
} from './admission-recommendation.model.js';

import {
  admissionSchema,
  admissionStatusHistorySchema,
} from './admission.model.js';

import {
  bedRateSchema,
  bedRateVersionSchema,
} from './bed-rate.model.js';

import {
  admissionBedAssignmentSchema,
  bedChargeSegmentSchema,
  bedHoldSchema,
  bedStatusHistorySchema,
} from './inpatient-bed-operation.model.js';

import {
  bedSchema,
  roomSchema,
  wardSchema,
} from './inpatient-location.model.js';

import {
  medicationAdministrationAmendmentSchema,
  medicationAdministrationSchema,
  medicationScheduleSchema,
  nursingEntryAmendmentSchema,
  nursingNoteSchema,
  nursingNoteVersionSchema,
  wardHandoverSchema,
} from './inpatient-nursing.model.js';


import {
  intakeOutputEntrySchema,
  nursingAssessmentSchema,
  nursingAssessmentVersionSchema,
  nursingCarePlanSchema,
  nursingCarePlanVersionSchema,
  nursingDeviceObservationSchema,
  nursingDeviceSchema,
  nursingTaskSchema,
} from './nursing-medication.model.js';

import {
  inventoryCategorySchema,
  inventoryItemSchema,
} from './inventory-catalog.model.js';

import {
  storeLocationSchema,
} from './inventory-location.model.js';

import {
  inventoryBatchSchema,
  stockBalanceSchema,
} from './inventory-stock.model.js';

import {
  supplierSchema,
} from './supplier.model.js';

import {
  procurementApprovalHistorySchema,
  purchaseInvoiceSchema,
  purchaseOrderItemSchema,
  purchaseOrderSchema,
  purchaseRequisitionItemSchema,
  purchaseRequisitionSchema,
} from './inventory-procurement.model.js';

import {
  goodsReceiptItemSchema,
  goodsReceiptSchema,
  supplierReturnItemSchema,
  supplierReturnSchema,
} from './inventory-receipt.model.js';

import {
  stockMovementSchema,
  stockReservationItemSchema,
  stockReservationSchema,
  stockTransferItemSchema,
  stockTransferSchema,
} from './inventory-operational.model.js';

import {
  physicalStockCountItemSchema,
  physicalStockCountSchema,
  productRecallItemSchema,
  productRecallSchema,
  reorderRuleSchema,
  stockAdjustmentSchema,
} from './inventory-control.model.js';

import {
  commonFields,
} from './common.js';

export const patientGuardianSchemas = {
  patients: patientSchema,
  patientIdentifiers: patientIdentifierSchema,
  guardians: guardianSchema,
  patientGuardians: patientGuardianSchema,
  patientContacts: patientContactSchema,
  patientAddresses: patientAddressSchema,
  patientAlerts: patientAlertSchema,
  patientMerges: patientMergeSchema,
} as const;

export const registrationQueueSchemas = {
  opdClinics: opdClinicSchema,
  servicePoints: servicePointSchema,
  serviceCounters: serviceCounterSchema,
  registrations: registrationSchema,
  opdVisits: opdVisitSchema,
  queueDefinitions: queueDefinitionSchema,
  queueTokens: queueTokenSchema,
  queueStatusHistories: queueStatusHistorySchema,
} as const;

export const clinicalEmrSchemas = {
  encounters: encounterSchema,
  encounterStatusHistories:
    encounterStatusHistorySchema,
  clinicalNotes: clinicalNoteSchema,
  clinicalNoteVersions: clinicalNoteVersionSchema,
  diagnoses: diagnosisSchema,
  encounterDiagnoses: encounterDiagnosisSchema,
  patientProblems: patientProblemSchema,
  patientProblemVersions: patientProblemVersionSchema,
  allergies: allergySchema,
  patientAllergies: patientAllergySchema,
  patientAllergyVersions: patientAllergyVersionSchema,
  clinicalReferrals: clinicalReferralSchema,
  vitalSigns: vitalSignSchema,
} as const;

export const formularyPrescriptionSchemas = {
  medicines: medicineSchema,
  medicineForms: medicineFormSchema,
  medicineRoutes: medicineRouteSchema,
  unitsOfMeasure: unitOfMeasureSchema,
  medicineStrengths: medicineStrengthSchema,
  prescriptionFrequencies:
    prescriptionFrequencySchema,
  formularyItems: formularyItemSchema,
  prescriptions: prescriptionSchema,
  prescriptionItems: prescriptionItemSchema,
  prescriptionSafetyWarnings:
    prescriptionSafetyWarningSchema,
  prescriptionStatusHistories:
    prescriptionStatusHistorySchema,
} as const;

export const laboratorySchemas = {
  labTestCategories: labTestCategorySchema,
  labTests: labTestSchema,
  labOrders: labOrderSchema,
  labOrderItems: labOrderItemSchema,
  labOrderStatusHistories:
    labOrderStatusHistorySchema,
  labSpecimens: labSpecimenSchema,
  labSpecimenStatusHistories:
    labSpecimenStatusHistorySchema,
  labResults: labResultSchema,
  labResultVersions: labResultVersionSchema,
  labCriticalResultCommunications:
    labCriticalResultCommunicationSchema,
} as const;

export const radiologySchemas = {
  radiologyModalities: radiologyModalitySchema,
  radiologyProcedures: radiologyProcedureSchema,
  radiologyOrders: radiologyOrderSchema,
  radiologyOrderItems: radiologyOrderItemSchema,
  radiologyOrderStatusHistories:
    radiologyOrderStatusHistorySchema,
  radiologyOrderItemStatusHistories:
    radiologyOrderItemStatusHistorySchema,
  radiologyResources: radiologyResourceSchema,
  radiologyAppointments: radiologyAppointmentSchema,
  radiologyResourceReservations:
    radiologyResourceReservationSchema,
  radiologySafetyScreenings:
    radiologySafetyScreeningSchema,
  radiologyExaminations: radiologyExaminationSchema,
  radiologyImagingStudies:
    radiologyImagingStudySchema,
  radiologyImagingSeries:
    radiologyImagingSeriesSchema,
  radiologyReports: radiologyReportSchema,
  radiologyReportVersions:
    radiologyReportVersionSchema,
  radiologyCriticalFindingCommunications:
    radiologyCriticalFindingCommunicationSchema,
} as const;

export const inpatientSchemas = {
  admissionRecommendations:
    admissionRecommendationSchema,

  wards: wardSchema,
  rooms: roomSchema,
  beds: bedSchema,
  bedRates: bedRateSchema,

  bedRateVersions:
    bedRateVersionSchema,

  admissions: admissionSchema,

  admissionStatusHistories:
    admissionStatusHistorySchema,

  bedHolds: bedHoldSchema,

  admissionBedAssignments:
    admissionBedAssignmentSchema,

  bedStatusHistories:
    bedStatusHistorySchema,

  bedChargeSegments:
    bedChargeSegmentSchema,
} as const;

export const inpatientNursingSchemas = {
  nursingNotes:
    nursingNoteSchema,

  nursingNoteVersions:
    nursingNoteVersionSchema,

  medicationSchedules:
    medicationScheduleSchema,

  medicationAdministrations:
    medicationAdministrationSchema,

  medicationAdministrationAmendments:
    medicationAdministrationAmendmentSchema,

  wardHandovers:
    wardHandoverSchema,

  nursingEntryAmendments:
    nursingEntryAmendmentSchema,
} as const;


export const nursingMedicationSchemas = {
  nursingAssessments: nursingAssessmentSchema,
  nursingAssessmentVersions: nursingAssessmentVersionSchema,
  nursingCarePlans: nursingCarePlanSchema,
  nursingCarePlanVersions: nursingCarePlanVersionSchema,
  nursingTasks: nursingTaskSchema,
  intakeOutputEntries: intakeOutputEntrySchema,
  nursingDevices: nursingDeviceSchema,
  nursingDeviceObservations: nursingDeviceObservationSchema,
} as const;

export const inventoryFoundationSchemas = {
  inventoryCategories: inventoryCategorySchema,
  inventoryItems: inventoryItemSchema,
  suppliers: supplierSchema,
  storeLocations: storeLocationSchema,
  inventoryBatches: inventoryBatchSchema,
  stockBalances: stockBalanceSchema,
} as const;

export const inventoryProcurementSchemas = {
  purchaseRequisitions: purchaseRequisitionSchema,
  purchaseRequisitionItems: purchaseRequisitionItemSchema,
  procurementApprovalHistories: procurementApprovalHistorySchema,
  purchaseOrders: purchaseOrderSchema,
  purchaseOrderItems: purchaseOrderItemSchema,
  goodsReceipts: goodsReceiptSchema,
  goodsReceiptItems: goodsReceiptItemSchema,
  purchaseInvoices: purchaseInvoiceSchema,
  supplierReturns: supplierReturnSchema,
  supplierReturnItems: supplierReturnItemSchema,
} as const;

export const inventoryOperationalSchemas = {
  stockMovements: stockMovementSchema,
  stockTransfers: stockTransferSchema,
  stockTransferItems: stockTransferItemSchema,
  stockReservations: stockReservationSchema,
  stockReservationItems: stockReservationItemSchema,
} as const;

export const inventoryControlSchemas = {
  stockAdjustments: stockAdjustmentSchema,
  physicalStockCounts: physicalStockCountSchema,
  physicalStockCountItems: physicalStockCountItemSchema,
  productRecalls: productRecallSchema,
  productRecallItems: productRecallItemSchema,
  reorderRules: reorderRuleSchema,
} as const;

function specFor(
  name: HospitalCollectionName,
) {
  const spec = collectionSpecs.find(
    (candidate) =>
      candidate.name === name,
  );

  if (spec === undefined) {
    throw new Error(
      `Collection specification not found for ${name}`,
    );
  }

  return spec;
}

export function schemaForCollection(
  name: HospitalCollectionName,
): Schema {
  const audit =
    auditSchemas[
      name as keyof typeof auditSchemas
    ];

  if (audit !== undefined) {
    return audit;
  }

  const accessControl =
    accessControlSchemas[
      name as keyof typeof accessControlSchemas
    ];

  if (accessControl !== undefined) {
    return accessControl;
  }

  const auth =
    authSchemas[
      name as keyof typeof authSchemas
    ];

  if (auth !== undefined) {
    return auth;
  }

  const facilityConfiguration =
    facilityConfigurationSchemas[
      name as keyof typeof facilityConfigurationSchemas
    ];

  if (
    facilityConfiguration !== undefined
  ) {
    return facilityConfiguration;
  }

  const patientGuardian =
    patientGuardianSchemas[
      name as keyof typeof patientGuardianSchemas
    ];

  if (patientGuardian !== undefined) {
    return patientGuardian;
  }

  const registrationQueue =
    registrationQueueSchemas[
      name as keyof typeof registrationQueueSchemas
    ];

  if (registrationQueue !== undefined) {
    return registrationQueue;
  }

  const clinicalEmr =
    clinicalEmrSchemas[
      name as keyof typeof clinicalEmrSchemas
    ];

  if (clinicalEmr !== undefined) {
    return clinicalEmr;
  }

  const formularyPrescription =
    formularyPrescriptionSchemas[
      name as keyof typeof formularyPrescriptionSchemas
    ];

  if (
    formularyPrescription !== undefined
  ) {
    return formularyPrescription;
  }

  const laboratory =
    laboratorySchemas[
      name as keyof typeof laboratorySchemas
    ];

  if (laboratory !== undefined) {
    return laboratory;
  }

  const radiology =
    radiologySchemas[
      name as keyof typeof radiologySchemas
    ];

  if (radiology !== undefined) {
    return radiology;
  }

  const inpatient =
    inpatientSchemas[
      name as keyof typeof inpatientSchemas
    ];

  if (inpatient !== undefined) {
    return inpatient;
  }

  const inpatientNursing =
    inpatientNursingSchemas[
      name as keyof typeof inpatientNursingSchemas
    ];

  if (inpatientNursing !== undefined) {
    return inpatientNursing;
  }


  const nursingMedication =
    nursingMedicationSchemas[
      name as keyof typeof nursingMedicationSchemas
    ];

  if (nursingMedication !== undefined) {
    return nursingMedication;
  }

  const inventoryFoundation =
    inventoryFoundationSchemas[
      name as keyof typeof inventoryFoundationSchemas
    ];

  if (inventoryFoundation !== undefined) {
    return inventoryFoundation;
  }

  const inventoryProcurement =
    inventoryProcurementSchemas[
      name as keyof typeof inventoryProcurementSchemas
    ];

  if (inventoryProcurement !== undefined) {
    return inventoryProcurement;
  }

  const inventoryOperational =
    inventoryOperationalSchemas[
      name as keyof typeof inventoryOperationalSchemas
    ];

  if (inventoryOperational !== undefined) {
    return inventoryOperational;
  }

  const inventoryControl =
    inventoryControlSchemas[
      name as keyof typeof inventoryControlSchemas
    ];

  if (inventoryControl !== undefined) {
    return inventoryControl;
  }

  const critical =
    criticalSchemas[
      name as keyof typeof criticalSchemas
    ];

  if (critical !== undefined) {
    return critical;
  }

  const common =
    specFor(name).facilityScoped
      ? commonFields
      : Object.fromEntries(
          Object.entries(commonFields).filter(
            ([key]) =>
              key !== 'facilityId',
          ),
        );

  const schema = new Schema(
    {
      ...common,
      data: {
        type: Schema.Types.Mixed,
        required: true,
        default: {},
      },
    },
    {
      collection: name,
      strict: true,
      versionKey: false,
    },
  );

  if (specFor(name).facilityScoped) {
    schema.index({
      facilityId: 1,
      createdAt: -1,
    });
  } else {
    schema.index({
      createdAt: -1,
    });
  }

  return schema;
}

export function registerAllModels(
  connection:
    mongoose.Connection =
      mongoose.connection,
) {
  return Object.fromEntries(
    collectionSpecs.map(
      (spec) => [
        spec.name,
        connection.models[spec.name] ??
          connection.model(
            spec.name,
            schemaForCollection(
              spec.name,
            ),
            spec.name,
          ),
      ],
    ),
  );
}
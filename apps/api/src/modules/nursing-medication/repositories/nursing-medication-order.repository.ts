import {
  FormularyItemModel,
  MedicineRouteModel,
  PrescriptionItemModel,
  PrescriptionModel,
  PrescriptionSafetyWarningModel,
  toObjectId,
} from '@hospital-mis/database';

import type {
  MedicationAdministrationRoute,
} from '@hospital-mis/database';

import type {
  MedicationOrderTrace,
} from '../nursing-mar.contracts.js';

import type {
  NursingMedicationOrderRepositoryPort,
} from '../nursing-mar.ports.js';

function oid(
  value: {
    toHexString(): string;
  },
): string {
  return value.toHexString();
}

function mapRoute(
  code: string,
): MedicationAdministrationRoute {
  switch (
    code
  ) {
    case 'ORAL':
      return 'ORAL';

    case 'INTRAVENOUS':
      return 'INTRAVENOUS';

    case 'INTRAMUSCULAR':
      return 'INTRAMUSCULAR';

    case 'SUBCUTANEOUS':
      return 'SUBCUTANEOUS';

    case 'INHALATION':
    case 'NEBULIZATION':
      return 'INHALATION';

    case 'TOPICAL':
    case 'TRANSDERMAL':
      return 'TOPICAL';

    case 'RECTAL':
      return 'RECTAL';

    case 'VAGINAL':
      return 'VAGINAL';

    case 'ENTERAL_TUBE':
      return 'ENTERAL';

    default:
      return 'OTHER';
  }
}

export class NursingMedicationOrderRepository
implements NursingMedicationOrderRepositoryPort {
  public async findOrderTrace(
    facilityId: string,
    prescriptionId: string,
    prescriptionItemId: string,
  ): Promise<MedicationOrderTrace | null> {
    const facilityObjectId =
      toObjectId(
        facilityId,
        'facilityId',
      );

    const prescriptionObjectId =
      toObjectId(
        prescriptionId,
        'prescriptionId',
      );

    const itemObjectId =
      toObjectId(
        prescriptionItemId,
        'prescriptionItemId',
      );

    const [
      prescription,
      item,
    ] = await Promise.all([
      PrescriptionModel.findOne({
        _id:
          prescriptionObjectId,

        facilityId:
          facilityObjectId,
      })
        .select(
          '_id facilityId patientId encounterId status signedBy prescriberProviderId',
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          facilityId: {
            toHexString(): string;
          };

          patientId: {
            toHexString(): string;
          };

          encounterId: {
            toHexString(): string;
          };

          status:
            MedicationOrderTrace['prescriptionStatus'];

          signedBy: {
            toHexString(): string;
          } | null;

          prescriberProviderId: {
            toHexString(): string;
          };
        }>()
        .exec(),

      PrescriptionItemModel.findOne({
        _id:
          itemObjectId,

        prescriptionId:
          prescriptionObjectId,

        facilityId:
          facilityObjectId,
      })
        .select(
          [
            '_id',
            'facilityId',
            'prescriptionId',
            'patientId',
            'encounterId',
            'formularyItemId',
            'medicineId',
            'selectedBrandName',
            'genericNameSnapshot',
            'medicineFormSnapshot',
            'medicineStrengthSnapshot',
            'dose',
            'doseUnitSnapshot',
            'routeId',
            'frequencySnapshot',
            'asNeeded',
            '+asNeededReason',
            'startDate',
            'endDate',
            'status',
            'dispensedQuantity',
            'lastDispensationId',
          ].join(' '),
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          facilityId: {
            toHexString(): string;
          };

          prescriptionId: {
            toHexString(): string;
          };

          patientId: {
            toHexString(): string;
          };

          encounterId: {
            toHexString(): string;
          };

          formularyItemId: {
            toHexString(): string;
          };

          medicineId: {
            toHexString(): string;
          };

          selectedBrandName:
            string | null;

          genericNameSnapshot:
            string;

          medicineFormSnapshot:
            string;

          medicineStrengthSnapshot:
            string;

          dose: {
            toString(): string;
          };

          doseUnitSnapshot:
            string;

          routeId: {
            toHexString(): string;
          };

          frequencySnapshot:
            string;

          asNeeded:
            boolean;

          asNeededReason:
            string | null;

          startDate:
            string;

          endDate:
            string | null;

          status:
            MedicationOrderTrace['prescriptionItemStatus'];

          dispensedQuantity: {
            toString(): string;
          };

          lastDispensationId: {
            toHexString(): string;
          } | null;
        }>()
        .exec(),
    ]);

    if (
      prescription ===
        null ||
      item ===
        null ||
      prescription.signedBy ===
        null
    ) {
      return null;
    }

    const [
      formularyItem,
      route,
      warnings,
    ] = await Promise.all([
      FormularyItemModel.findOne({
        _id:
          toObjectId(
            item.formularyItemId.toHexString(),
            'formularyItemId',
          ),

        facilityId:
          facilityObjectId,
      })
        .select(
          'stockTracked highAlert controlledMedicine',
        )
        .lean<{
          stockTracked: boolean;
          highAlert: boolean;
          controlledMedicine: boolean;
        }>()
        .exec(),

      MedicineRouteModel.findOne({
        _id:
          toObjectId(
            item.routeId.toHexString(),
            'routeId',
          ),

        facilityId:
          facilityObjectId,
      })
        .select(
          'code',
        )
        .lean<{
          code: string;
        }>()
        .exec(),

      PrescriptionSafetyWarningModel.find({
        facilityId:
          facilityObjectId,

        prescriptionId:
          prescriptionObjectId,

        $or: [
          {
            prescriptionItemId:
              itemObjectId,
          },
          {
            prescriptionItemId:
              null,
          },
        ],

        status: {
          $in: [
            'OPEN',
            'ACKNOWLEDGED',
          ],
        },
      })
        .select(
          '_id warningType severity status warningCode message',
        )
        .lean<{
          _id: {
            toHexString(): string;
          };

          warningType:
            string;

          severity:
            MedicationOrderTrace['openWarnings'][number]['severity'];

          status:
            MedicationOrderTrace['openWarnings'][number]['status'];

          warningCode:
            string;

          message:
            string;
        }[]>()
        .exec(),
    ]);

    if (
      formularyItem ===
        null ||
      route ===
        null
    ) {
      return null;
    }

    const medicineDisplay = [
      item.genericNameSnapshot,
      item.medicineStrengthSnapshot,
      item.medicineFormSnapshot,

      item.selectedBrandName ==
      null
        ? null
        : `(${item.selectedBrandName})`,
    ]
      .filter(
        (
          value,
        ): value is string =>
          value !== null,
      )
      .join(' ');

    return {
      prescriptionId:
        oid(
          prescription._id,
        ),

      prescriptionItemId:
        oid(
          item._id,
        ),

      facilityId:
        oid(
          prescription.facilityId,
        ),

      patientId:
        oid(
          prescription.patientId,
        ),

      encounterId:
        oid(
          prescription.encounterId,
        ),

      prescriptionStatus:
        prescription.status,

      prescriptionItemStatus:
        item.status,

      medicineId:
        oid(
          item.medicineId,
        ),

      formularyItemId:
        oid(
          item.formularyItemId,
        ),

      medicineDisplay,

      prescribedDose:
        item.dose.toString(),

      doseUnitCode:
        item.doseUnitSnapshot,

      prescribedRoute:
        mapRoute(
          route.code,
        ),

      frequencyCode:
        item.frequencySnapshot,

      asNeeded:
        item.asNeeded,

      asNeededReason:
        item.asNeededReason,

      startDate:
        item.startDate,

      endDate:
        item.endDate,

      orderedByUserId:
        oid(
          prescription.signedBy,
        ),

      orderedByStaffId:
        oid(
          prescription.prescriberProviderId,
        ),

      dispensedQuantity:
        item.dispensedQuantity.toString(),

      lastDispensationId:
        item.lastDispensationId
          ?.toHexString() ?? null,

      stockTracked:
        formularyItem.stockTracked,

      highAlert:
        formularyItem.highAlert,

      controlledMedicine:
        formularyItem.controlledMedicine,

      openWarnings:
        warnings.map(
          (warning) => ({
            warningId:
              warning._id.toHexString(),

            warningType:
              warning.warningType,

            severity:
              warning.severity,

            status:
              warning.status,

            warningCode:
              warning.warningCode,

            message:
              warning.message,
          }),
        ),
    };
  }
}
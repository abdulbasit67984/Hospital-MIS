import {
  FormularyItemNotFoundError,
  FormularyPrescriptionMinimumNecessaryAccessError,
  PrescriptionNotFoundError,
} from '../formulary-prescriptions.errors.js';

import {
  toFormularyItemView,
  toPrescriptionHistoryEntryView,
  toPrescriptionView,
} from '../formulary-prescriptions.mapper.js';

import type {
  FormularyItemView,
  FormularyPrescriptionActorContext,
  FormularySearchQuery,
  PrescriptionHistoryEntryView,
  PrescriptionListQuery,
  PrescriptionView,
} from '../formulary-prescriptions.types.js';

import type {
  FormularyPrescriptionAccessAction,
  FormularyPrescriptionAccessDecision,
  FormularyPrescriptionAccessRequest,
} from './formulary-prescription-access-policy.service.js';

import {
  FormularyPrescriptionAccessPolicyService,
} from './formulary-prescription-access-policy.service.js';

import {
  FormularyPrescriptionContextService,
} from './formulary-prescription-context.service.js';

import {
  FormularyPrescriptionSensitiveReadAuditor,
  type FormularyPrescriptionReadResource,
} from './formulary-prescription-sensitive-read-auditor.service.js';

import {
  MedicineFormularyRepository,
} from '../repositories/medicine-formulary.repository.js';

import {
  PrescriptionRepository,
} from '../repositories/prescription.repository.js';

import type {
  FormularyPrescriptionClockPort,
  FormularyStockVisibilityPort,
} from '../formulary-prescriptions.ports.js';

import type {
  PrescriptionRecord,
} from '../formulary-prescriptions.persistence.types.js';

export interface PaginatedFormularyItems {
  items:
    readonly FormularyItemView[];

  page:
    number;

  pageSize:
    number;

  total:
    number;

  totalPages:
    number;
}

export interface PaginatedPrescriptions {
  items:
    readonly PrescriptionView[];

  page:
    number;

  pageSize:
    number;

  total:
    number;

  totalPages:
    number;
}

export interface PatientMedicationHistory {
  patientId:
    string;

  prescriptions:
    readonly PrescriptionView[];

  page:
    number;

  pageSize:
    number;

  total:
    number;

  totalPages:
    number;
}

export class FormularyPrescriptionQueryService {
  public constructor(
    private readonly catalog:
      MedicineFormularyRepository,

    private readonly prescriptions:
      PrescriptionRepository,

    private readonly context:
      FormularyPrescriptionContextService,

    private readonly accessPolicy:
      FormularyPrescriptionAccessPolicyService,

    private readonly readAuditor:
      FormularyPrescriptionSensitiveReadAuditor,

    private readonly clock:
      FormularyPrescriptionClockPort,

    private readonly stock:
      FormularyStockVisibilityPort | null =
        null,
  ) {}

  private async authorize(
    request:
      FormularyPrescriptionAccessRequest,
  ): Promise<FormularyPrescriptionAccessDecision> {
    const decision =
      await this.accessPolicy.authorize(
        request,
      );

    if (!decision.allowed) {
      throw new FormularyPrescriptionMinimumNecessaryAccessError();
    }

    return decision;
  }

  private async prescriptionDecision(
    actor:
      FormularyPrescriptionActorContext,

    prescription:
      PrescriptionRecord,

    action:
      FormularyPrescriptionAccessAction =
        'PRESCRIPTION_READ',
  ): Promise<FormularyPrescriptionAccessDecision> {
    let clinicalContext:
      Awaited<
        ReturnType<
          FormularyPrescriptionContextService[
            'resolveActiveEncounter'
          ]
        >
      > | undefined;

    if (
      prescription.status ===
      'DRAFT'
    ) {
      clinicalContext =
        await this.context
          .resolveActiveEncounter(
            actor.facilityId,
            prescription.encounterId
              .toHexString(),
          );
    }

    return this.authorize({
      actor,
      action,
      prescription,

      ...(clinicalContext ===
      undefined
        ? {}
        : {
            clinicalContext,
          }),
    });
  }

  private async mapFormularyItem(
    actor:
      FormularyPrescriptionActorContext,

    item:
      Awaited<
        ReturnType<
          MedicineFormularyRepository[
            'findFormularyItemById'
          ]
        >
      > extends infer TValue
        ? Exclude<
            TValue,
            null
          >
        : never,

    includeStock:
      boolean,

    stockByInventoryItemId:
      ReadonlyMap<
        string,
        Awaited<
          ReturnType<
            FormularyStockVisibilityPort[
              'read'
            ]
          >
        > extends ReadonlyMap<
          string,
          infer TValue
        >
          ? TValue
          : never
      > =
        new Map(),
  ): Promise<FormularyItemView> {
    const [
      medicine,
      medicineForm,
      medicineStrength,
      routes,
      doseUnit,
      quantityUnit,
    ] =
      await Promise.all([
        this.catalog.findMedicineById(
          actor.facilityId,
          item.medicineId
            .toHexString(),
        ),

        this.catalog.findMedicineFormById(
          actor.facilityId,
          item.medicineFormId
            .toHexString(),
        ),

        this.catalog.findMedicineStrengthById(
          actor.facilityId,
          item.medicineStrengthId
            .toHexString(),
        ),

        this.catalog.findMedicineRoutesByIds(
          actor.facilityId,
          item.allowedRouteIds.map(
            (routeId) =>
              routeId.toHexString(),
          ),
        ),

        this.catalog.findUnitOfMeasureById(
          actor.facilityId,
          item.doseUnitId
            .toHexString(),
        ),

        this.catalog.findUnitOfMeasureById(
          actor.facilityId,
          item.quantityUnitId
            .toHexString(),
        ),
      ]);

    if (
      medicine === null ||
      medicineForm === null ||
      medicineStrength === null ||
      doseUnit === null ||
      quantityUnit === null
    ) {
      throw new FormularyItemNotFoundError();
    }

    const inventoryItemId =
      item.inventoryItemId
        ?.toHexString() ??
      null;

    return toFormularyItemView(
      item,
      {
        medicine,
        medicineForm,
        medicineStrength,
        routes,
        doseUnit,
        quantityUnit,

        ...(includeStock &&
        inventoryItemId !== null
          ? {
              stock:
                stockByInventoryItemId.get(
                  inventoryItemId,
                ),
            }
          : {}),
      },
    );
  }

  public async getFormularyItem(
    actor:
      FormularyPrescriptionActorContext,

    formularyItemId:
      string,

    includeStock =
      false,
  ): Promise<FormularyItemView> {
    await this.authorize({
      actor,
      action:
        'FORMULARY_READ',
    });

    if (includeStock) {
      await this.authorize({
        actor,
        action:
          'STOCK_READ',
      });
    }

    const item =
      await this.catalog
        .findFormularyItemById(
          actor.facilityId,
          formularyItemId,
        );

    if (item === null) {
      throw new FormularyItemNotFoundError();
    }

    const inventoryItemIds =
      item.inventoryItemId ===
      null
        ? []
        : [
            item.inventoryItemId
              .toHexString(),
          ];

    const stock =
      includeStock &&
      this.stock !== null
        ? await this.stock.read(
            actor.facilityId,
            inventoryItemIds,
          )
        : new Map();

    return this.mapFormularyItem(
      actor,
      item,
      includeStock,
      stock,
    );
  }

  public async searchFormulary(
    actor:
      FormularyPrescriptionActorContext,

    query:
      FormularySearchQuery,
  ): Promise<PaginatedFormularyItems> {
    await this.authorize({
      actor,
      action:
        'FORMULARY_READ',
    });

    if (query.includeStock) {
      await this.authorize({
        actor,
        action:
          'STOCK_READ',
      });
    }

    const result =
      await this.catalog.searchFormulary(
        actor.facilityId,
        query,
      );

    const inventoryItemIds =
      result.items.flatMap(
        (item) =>
          item.inventoryItemId ===
          null
            ? []
            : [
                item.inventoryItemId
                  .toHexString(),
              ],
      );

    const stock =
      query.includeStock &&
      this.stock !== null
        ? await this.stock.read(
            actor.facilityId,
            inventoryItemIds,
          )
        : new Map();

    const items =
      await Promise.all(
        result.items.map(
          async (item) =>
            this.mapFormularyItem(
              actor,
              item,
              query.includeStock ??
                false,
              stock,
            ),
        ),
      );

    return {
      items,

      page:
        query.page,

      pageSize:
        query.pageSize,

      total:
        result.total,

      totalPages:
        Math.ceil(
          result.total /
          query.pageSize,
        ),
    };
  }

  private async auditPrescriptionRead(
    actor:
      FormularyPrescriptionActorContext,

    prescription:
      PrescriptionRecord,

    decision:
      FormularyPrescriptionAccessDecision,

    resource:
      FormularyPrescriptionReadResource,

    returnedFieldGroups:
      readonly string[],
  ): Promise<void> {
    await this.readAuditor.recordRead({
      actor,

      patientId:
        prescription.patientId
          .toHexString(),

      encounterId:
        prescription.encounterId
          .toHexString(),

      prescriptionId:
        prescription._id
          .toHexString(),

      entityType:
        'Prescription',

      entityId:
        prescription._id
          .toHexString(),

      resource,

      accessDecision:
        decision,

      returnedFieldGroups,

      occurredAt:
        this.clock.now(),
    });
  }

  public async getPrescription(
    actor:
      FormularyPrescriptionActorContext,

    prescriptionId:
      string,

    includeItems =
      true,

    includeWarnings =
      true,
  ): Promise<PrescriptionView> {
    const prescription =
      await this.prescriptions
        .findById(
          actor.facilityId,
          prescriptionId,
        );

    if (prescription === null) {
      throw new PrescriptionNotFoundError();
    }

    const decision =
      await this.prescriptionDecision(
        actor,
        prescription,
      );

    const [
      items,
      warnings,
    ] =
      await Promise.all([
        includeItems
          ? this.prescriptions.listItems(
              actor.facilityId,
              prescriptionId,
            )
          : Promise.resolve(
              undefined,
            ),

        includeWarnings
          ? this.prescriptions
              .listForPrescription(
                actor.facilityId,
                prescriptionId,
                true,
              )
          : Promise.resolve(
              undefined,
            ),
      ]);

    const returnedFieldGroups =
      [
        'identity',
        'encounterContext',
        'prescriberAttribution',
        'lifecycle',
        'version',

        ...(includeItems
          ? [
              'medicineSelection',
              'dose',
              'frequency',
              'route',
              'duration',
              'quantity',
              'instructions',
              'dispensationTrace',
            ]
          : []),

        ...(includeWarnings
          ? [
              'safetyWarnings',
            ]
          : []),
      ];

    await this.auditPrescriptionRead(
      actor,
      prescription,
      decision,
      'PRESCRIPTION_DETAIL',
      returnedFieldGroups,
    );

    return toPrescriptionView(
      prescription,
      {
        ...(items === undefined
          ? {}
          : {
              items,
            }),

        ...(warnings === undefined
          ? {}
          : {
              warnings,
            }),
      },
    );
  }

  public async listPrescriptions(
    actor:
      FormularyPrescriptionActorContext,

    query:
      PrescriptionListQuery,
  ): Promise<PaginatedPrescriptions> {
    const result =
      await this.prescriptions.list(
        actor.facilityId,
        query,
      );

    const permitted:
      PrescriptionView[] = [];

    for (
      const prescription of
      result.items
    ) {
      let decision:
        FormularyPrescriptionAccessDecision;

      try {
        decision =
          await this.prescriptionDecision(
            actor,
            prescription,
          );
      } catch (
        _error
      ) {
        continue;
      }

      const [
        items,
        warnings,
      ] =
        await Promise.all([
          query.includeItems
            ? this.prescriptions
                .listItems(
                  actor.facilityId,
                  prescription._id
                    .toHexString(),
                )
            : Promise.resolve(
                undefined,
              ),

          query.includeWarnings
            ? this.prescriptions
                .listForPrescription(
                  actor.facilityId,
                  prescription._id
                    .toHexString(),
                  true,
                )
            : Promise.resolve(
                undefined,
              ),
        ]);

      permitted.push(
        toPrescriptionView(
          prescription,
          {
            ...(items ===
            undefined
              ? {}
              : {
                  items,
                }),

            ...(warnings ===
            undefined
              ? {}
              : {
                  warnings,
                }),
          },
        ),
      );

      await this.auditPrescriptionRead(
        actor,
        prescription,
        decision,
        'PRESCRIPTION_LIST',
        [
          'identity',
          'encounterContext',
          'prescriberAttribution',
          'lifecycle',
          'version',

          ...(query.includeItems
            ? [
                'medicineSelection',
                'dose',
                'frequency',
                'route',
                'duration',
                'quantity',
                'instructions',
                'dispensationTrace',
              ]
            : []),

          ...(query.includeWarnings
            ? [
                'safetyWarnings',
              ]
            : []),
        ],
      );
    }

    const completePage =
      permitted.length ===
      result.items.length;

    const total =
      completePage
        ? result.total
        : permitted.length;

    return {
      items:
        permitted,

      page:
        query.page,

      pageSize:
        query.pageSize,

      total,

      totalPages:
        Math.ceil(
          total /
          query.pageSize,
        ),
    };
  }

  public async getPrescriptionHistory(
    actor:
      FormularyPrescriptionActorContext,

    prescriptionId:
      string,
  ): Promise<
    readonly PrescriptionHistoryEntryView[]
  > {
    const prescription =
      await this.prescriptions
        .findById(
          actor.facilityId,
          prescriptionId,
        );

    if (prescription === null) {
      throw new PrescriptionNotFoundError();
    }

    const decision =
      await this.prescriptionDecision(
        actor,
        prescription,
      );

    const history =
      await this.prescriptions
        .listHistory(
          actor.facilityId,
          prescriptionId,
        );

    await this.auditPrescriptionRead(
      actor,
      prescription,
      decision,
      'PRESCRIPTION_HISTORY',
      [
        'identity',
        'prescriberAttribution',
        'lifecycleHistory',
        'signatureAttribution',
      ],
    );

    return history.map(
      toPrescriptionHistoryEntryView,
    );
  }

  public async patientMedicationHistory(
    actor:
      FormularyPrescriptionActorContext,

    patientId:
      string,

    query:
      Omit<
        PrescriptionListQuery,
        'patientId'
      >,
  ): Promise<PatientMedicationHistory> {
    const result =
      await this.listPrescriptions(
        actor,
        {
          ...query,

          patientId,

          includeItems:
            true,
        },
      );

    for (
      const prescription of
      result.items
    ) {
      const stored =
        await this.prescriptions
          .findById(
            actor.facilityId,
            prescription.id,
          );

      if (stored === null) {
        continue;
      }

      const decision =
        await this.prescriptionDecision(
          actor,
          stored,
        );

      await this.auditPrescriptionRead(
        actor,
        stored,
        decision,
        'PATIENT_MEDICATION_HISTORY',
        [
          'identity',
          'prescriberAttribution',
          'lifecycle',
          'medicineSelection',
          'dose',
          'frequency',
          'route',
          'duration',
          'quantity',
          'instructions',
          'dispensationTrace',
        ],
      );
    }

    return {
      patientId,

      prescriptions:
        result.items,

      page:
        result.page,

      pageSize:
        result.pageSize,

      total:
        result.total,

      totalPages:
        result.totalPages,
    };
  }
}
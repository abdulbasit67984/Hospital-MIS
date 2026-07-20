import Decimal from 'decimal.js';
import {
  z,
} from 'zod';

import {
  inventoryBatchInspectionStatusValues,
  inventoryBatchStatusValues,
  inventoryCatalogStatusValues,
  inventoryCategoryTypeValues,
  inventoryItemTypeValues,
  inventoryLocationTypeValues,
  inventoryRecallStatusValues,
  inventoryStorageConditionValues,
  inventoryUnitPurposeValues,
  inventoryValuationMethodValues,
  supplierAddressTypeValues,
  supplierContactTypeValues,
  supplierStatusValues,
} from '@hospital-mis/database';

import {
  DEFAULT_INVENTORY_PAGE_SIZE,
  INVENTORY_BATCH_SORT_FIELDS,
  INVENTORY_CATEGORY_SORT_FIELDS,
  INVENTORY_ITEM_SORT_FIELDS,
  INVENTORY_LOCATION_SORT_FIELDS,
  INVENTORY_SUPPLIER_SORT_FIELDS,
  MAX_INVENTORY_PAGE_SIZE,
  STOCK_BALANCE_SORT_FIELDS,
} from './inventory.constants.js';

export const inventoryObjectIdSchema = z
  .string()
  .regex(
    /^[a-f\d]{24}$/iu,
    'Expected a valid MongoDB ObjectId',
  );

export const inventoryExpectedVersionSchema = z
  .number()
  .int()
  .min(0);

export const inventoryIsoDateTimeSchema = z
  .string()
  .datetime({
    offset: true,
  });

export const inventoryReasonSchema = z
  .string()
  .trim()
  .min(5)
  .max(5_000);

export const inventoryDecimalStringSchema = z
  .string()
  .trim()
  .regex(
    /^[+-]?\d{1,24}(?:\.\d{1,8})?$/u,
    'Expected a decimal with no more than eight decimal places',
  )
  .refine(
    (value) => {
      try {
        return new Decimal(value).isFinite();
      } catch {
        return false;
      }
    },
    'Expected a finite decimal value',
  );

export const inventoryNonNegativeDecimalStringSchema =
  inventoryDecimalStringSchema.refine(
    (value) => new Decimal(value).gte(0),
    'Expected a non-negative decimal value',
  );

export const inventoryPositiveDecimalStringSchema =
  inventoryDecimalStringSchema.refine(
    (value) => new Decimal(value).gt(0),
    'Expected a decimal value greater than zero',
  );

const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._/\-\s]*$/u,
    'Code contains unsupported characters',
  );

const nullableText = (
  minimum: number,
  maximum: number,
) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .nullable()
    .optional();

const nullableObjectIdSchema =
  inventoryObjectIdSchema
    .nullable()
    .optional();

const pageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .default(1);

const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_INVENTORY_PAGE_SIZE)
  .default(DEFAULT_INVENTORY_PAGE_SIZE);

const booleanQuerySchema = z
  .union([
    z.boolean(),
    z.enum(['true', 'false']).transform(
      (value) => value === 'true',
    ),
  ])
  .optional();

export const inventoryMutationHeadersSchema = z
  .object({
    'idempotency-key': z
      .string()
      .trim()
      .min(8)
      .max(200)
      .regex(
        /^[A-Za-z0-9._:/-]+$/u,
        'Idempotency key contains unsupported characters',
      ),

    'x-break-glass-reason': z
      .string()
      .trim()
      .min(10)
      .max(1_000)
      .optional(),
  })
  .strict();

export const inventoryReadHeadersSchema = z
  .object({
    'x-break-glass-reason': z
      .string()
      .trim()
      .min(10)
      .max(1_000)
      .optional(),
  })
  .strict();

export const inventoryEntityParamsSchema = z
  .object({
    categoryId: inventoryObjectIdSchema.optional(),
    itemId: inventoryObjectIdSchema.optional(),
    supplierId: inventoryObjectIdSchema.optional(),
    locationId: inventoryObjectIdSchema.optional(),
    batchId: inventoryObjectIdSchema.optional(),
    balanceId: inventoryObjectIdSchema.optional(),
  })
  .strict();

export const inventoryUnitConversionInputSchema = z
  .object({
    unitId: inventoryObjectIdSchema,
    purpose: z.enum(inventoryUnitPurposeValues),
    toStockUnitFactor: inventoryPositiveDecimalStringSchema,
    isDefault: z.boolean().default(false),
  })
  .strict();

export const supplierCatalogueEntryInputSchema = z
  .object({
    supplierId: inventoryObjectIdSchema,
    supplierItemCode: z.string().trim().min(1).max(120),
    supplierItemName: nullableText(1, 500),
    purchaseUnitId: inventoryObjectIdSchema,
    purchaseUnitToStockFactor: inventoryPositiveDecimalStringSchema,
    minimumOrderQuantity: inventoryPositiveDecimalStringSchema.default('1'),
    lastQuotedUnitCost: inventoryNonNegativeDecimalStringSchema.nullable().optional(),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('PKR'),
    leadTimeDays: z.number().int().min(0).max(3_650).nullable().optional(),
    preferred: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .strict();

export const createInventoryCategoryBodySchema = z
  .object({
    categoryCode: codeSchema,
    name: z.string().trim().min(2).max(300),
    categoryType: z.enum(inventoryCategoryTypeValues).default('MIXED'),
    parentCategoryId: nullableObjectIdSchema,
    description: nullableText(1, 5_000),
    displayOrder: z.number().int().min(0).max(100_000).default(0),
  })
  .strict();

export const updateInventoryCategoryBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    name: z.string().trim().min(2).max(300).optional(),
    categoryType: z.enum(inventoryCategoryTypeValues).optional(),
    parentCategoryId: nullableObjectIdSchema,
    description: nullableText(1, 5_000),
    displayOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedVersion'),
    'At least one inventory category field must be changed',
  );

export const changeInventoryCatalogStatusBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    status: z.enum(inventoryCatalogStatusValues),
    reason: inventoryReasonSchema,
  })
  .strict();

const itemFields = {
  name: z.string().trim().min(2).max(500),
  categoryId: inventoryObjectIdSchema,
  barcode: nullableText(1, 100),
  manufacturerName: nullableText(1, 300),
  description: nullableText(1, 5_000),
  purchaseUnitId: inventoryObjectIdSchema,
  purchaseUnitToStockFactor: inventoryPositiveDecimalStringSchema,
  issueUnitId: inventoryObjectIdSchema,
  issueUnitToStockFactor: inventoryPositiveDecimalStringSchema,
  unitConversions: z.array(inventoryUnitConversionInputSchema).max(50).default([]),
  allowFractionalStock: z.boolean().default(false),
  batchTrackingRequired: z.boolean().default(false),
  expiryTrackingRequired: z.boolean().default(false),
  storageConditions: z.array(z.enum(inventoryStorageConditionValues)).min(1).max(20).default(['AMBIENT']),
  minimumStorageTemperatureCelsius: inventoryDecimalStringSchema.nullable().optional(),
  maximumStorageTemperatureCelsius: inventoryDecimalStringSchema.nullable().optional(),
  reorderLevel: inventoryNonNegativeDecimalStringSchema.default('0'),
  minimumStockLevel: inventoryNonNegativeDecimalStringSchema.default('0'),
  maximumStockLevel: inventoryNonNegativeDecimalStringSchema.nullable().optional(),
  safetyStockLevel: inventoryNonNegativeDecimalStringSchema.default('0'),
  nearExpiryWarningDays: z.number().int().min(0).max(3_650).default(90),
  negativeStockAllowed: z.boolean().default(false),
  controlledMedicine: z.boolean().default(false),
  highAlert: z.boolean().default(false),
  highValue: z.boolean().default(false),
  preferredSupplierIds: z.array(inventoryObjectIdSchema).max(100).default([]),
  supplierCatalogueEntries: z.array(supplierCatalogueEntryInputSchema).max(100).default([]),
} as const;

function validateItemBusinessRules(
  value: {
    itemType?: string;
    formularyItemId?: string | null;
    stockUnitId?: string;
    purchaseUnitId?: string;
    purchaseUnitToStockFactor?: string;
    issueUnitId?: string;
    issueUnitToStockFactor?: string;
    batchTrackingRequired?: boolean;
    expiryTrackingRequired?: boolean;
    minimumStorageTemperatureCelsius?: string | null;
    maximumStorageTemperatureCelsius?: string | null;
    reorderLevel?: string;
    minimumStockLevel?: string;
    maximumStockLevel?: string | null;
    safetyStockLevel?: string;
    preferredSupplierIds?: readonly string[];
    supplierCatalogueEntries?: readonly {
      supplierId: string;
      preferred: boolean;
      active: boolean;
    }[];
    unitConversions?: readonly {
      unitId: string;
      purpose: string;
      toStockUnitFactor: string;
      isDefault: boolean;
    }[];
  },
  context: z.RefinementCtx,
): void {
  if (value.itemType === 'MEDICATION' && value.formularyItemId == null) {
    context.addIssue({
      code: 'custom',
      path: ['formularyItemId'],
      message: 'Medication inventory items require a formulary-item link',
    });
  }

  if (value.itemType === 'NON_MEDICATION' && value.formularyItemId != null) {
    context.addIssue({
      code: 'custom',
      path: ['formularyItemId'],
      message: 'Non-medication inventory items cannot link to a formulary item',
    });
  }

  if (value.expiryTrackingRequired === true && value.batchTrackingRequired !== true) {
    context.addIssue({
      code: 'custom',
      path: ['expiryTrackingRequired'],
      message: 'Expiry tracking requires batch tracking',
    });
  }

  const compare = (left?: string | null, right?: string | null): number | null => {
    if (left == null || right == null) {
      return null;
    }

    return new Decimal(left).comparedTo(new Decimal(right));
  };

  if (compare(value.minimumStockLevel, value.reorderLevel) === 1) {
    context.addIssue({
      code: 'custom',
      path: ['reorderLevel'],
      message: 'Reorder level cannot be lower than minimum stock level',
    });
  }

  if (compare(value.safetyStockLevel, value.minimumStockLevel) === 1) {
    context.addIssue({
      code: 'custom',
      path: ['safetyStockLevel'],
      message: 'Safety stock cannot exceed minimum stock level',
    });
  }

  if (compare(value.minimumStockLevel, value.maximumStockLevel) === 1) {
    context.addIssue({
      code: 'custom',
      path: ['maximumStockLevel'],
      message: 'Maximum stock cannot be lower than minimum stock level',
    });
  }

  if (compare(value.reorderLevel, value.maximumStockLevel) === 1) {
    context.addIssue({
      code: 'custom',
      path: ['maximumStockLevel'],
      message: 'Maximum stock cannot be lower than reorder level',
    });
  }

  if (
    compare(
      value.minimumStorageTemperatureCelsius,
      value.maximumStorageTemperatureCelsius,
    ) === 1
  ) {
    context.addIssue({
      code: 'custom',
      path: ['maximumStorageTemperatureCelsius'],
      message: 'Maximum storage temperature cannot be lower than minimum storage temperature',
    });
  }

  const factorEqualsOne = (factor: string | undefined): boolean =>
    factor === undefined || new Decimal(factor).eq(1);

  if (
    value.stockUnitId !== undefined &&
    value.purchaseUnitId?.toLowerCase() === value.stockUnitId.toLowerCase() &&
    !factorEqualsOne(value.purchaseUnitToStockFactor)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['purchaseUnitToStockFactor'],
      message: 'A purchase unit equal to the stock unit must have conversion factor one',
    });
  }

  if (
    value.stockUnitId !== undefined &&
    value.issueUnitId?.toLowerCase() === value.stockUnitId.toLowerCase() &&
    !factorEqualsOne(value.issueUnitToStockFactor)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['issueUnitToStockFactor'],
      message: 'An issue unit equal to the stock unit must have conversion factor one',
    });
  }

  if (
    value.purchaseUnitId !== undefined &&
    value.issueUnitId?.toLowerCase() === value.purchaseUnitId.toLowerCase() &&
    value.purchaseUnitToStockFactor !== undefined &&
    value.issueUnitToStockFactor !== undefined &&
    !new Decimal(value.purchaseUnitToStockFactor).eq(value.issueUnitToStockFactor)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['issueUnitToStockFactor'],
      message: 'The same unit cannot have conflicting stock conversion factors',
    });
  }

  const conversionKeys = (value.unitConversions ?? []).map(
    (entry) => `${entry.unitId.toLowerCase()}:${entry.purpose}`,
  );

  if (new Set(conversionKeys).size !== conversionKeys.length) {
    context.addIssue({
      code: 'custom',
      path: ['unitConversions'],
      message: 'Unit conversions must be unique by unit and purpose',
    });
  }

  const defaultPurposes = (value.unitConversions ?? [])
    .filter((entry) => entry.isDefault)
    .map((entry) => entry.purpose);

  if (new Set(defaultPurposes).size !== defaultPurposes.length) {
    context.addIssue({
      code: 'custom',
      path: ['unitConversions'],
      message: 'Only one default unit conversion is allowed per purpose',
    });
  }

  const factorByUnit = new Map<string, Decimal>();

  for (const conversion of value.unitConversions ?? []) {
    const unitId = conversion.unitId.toLowerCase();
    const factor = new Decimal(conversion.toStockUnitFactor);
    const existing = factorByUnit.get(unitId);

    if (existing !== undefined && !existing.eq(factor)) {
      context.addIssue({
        code: 'custom',
        path: ['unitConversions'],
        message: 'The same unit cannot have conflicting stock conversion factors',
      });
      break;
    }

    factorByUnit.set(unitId, factor);

    if (
      value.stockUnitId !== undefined &&
      unitId === value.stockUnitId.toLowerCase() &&
      !factor.eq(1)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['unitConversions'],
        message: 'A conversion for the stock unit must have factor one',
      });
      break;
    }
  }

  const preferredSupplierIds = new Set(
    (value.preferredSupplierIds ?? []).map((supplierId) => supplierId.toLowerCase()),
  );

  for (const entry of value.supplierCatalogueEntries ?? []) {
    if (entry.preferred && !preferredSupplierIds.has(entry.supplierId.toLowerCase())) {
      context.addIssue({
        code: 'custom',
        path: ['preferredSupplierIds'],
        message: 'Preferred catalogue suppliers must also be listed in preferredSupplierIds',
      });
      break;
    }
  }
}

export const createInventoryItemBodySchema = z
  .object({
    itemCode: codeSchema,
    itemType: z.enum(inventoryItemTypeValues),
    formularyItemId: nullableObjectIdSchema,
    stockUnitId: inventoryObjectIdSchema,
    valuationMethod: z.enum(inventoryValuationMethodValues).default('BATCH_COST'),
    ...itemFields,
  })
  .strict()
  .superRefine(validateItemBusinessRules);

export const updateInventoryItemBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    name: itemFields.name.optional(),
    categoryId: itemFields.categoryId.optional(),
    barcode: itemFields.barcode,
    manufacturerName: itemFields.manufacturerName,
    description: itemFields.description,
    purchaseUnitId: itemFields.purchaseUnitId.optional(),
    purchaseUnitToStockFactor: itemFields.purchaseUnitToStockFactor.optional(),
    issueUnitId: itemFields.issueUnitId.optional(),
    issueUnitToStockFactor: itemFields.issueUnitToStockFactor.optional(),
    unitConversions: z.array(inventoryUnitConversionInputSchema).max(50).optional(),
    allowFractionalStock: z.boolean().optional(),
    batchTrackingRequired: z.boolean().optional(),
    expiryTrackingRequired: z.boolean().optional(),
    storageConditions: z.array(z.enum(inventoryStorageConditionValues)).min(1).max(20).optional(),
    minimumStorageTemperatureCelsius: inventoryDecimalStringSchema.nullable().optional(),
    maximumStorageTemperatureCelsius: inventoryDecimalStringSchema.nullable().optional(),
    reorderLevel: inventoryNonNegativeDecimalStringSchema.optional(),
    minimumStockLevel: inventoryNonNegativeDecimalStringSchema.optional(),
    maximumStockLevel: inventoryNonNegativeDecimalStringSchema.nullable().optional(),
    safetyStockLevel: inventoryNonNegativeDecimalStringSchema.optional(),
    nearExpiryWarningDays: z.number().int().min(0).max(3_650).optional(),
    negativeStockAllowed: z.boolean().optional(),
    controlledMedicine: z.boolean().optional(),
    highAlert: z.boolean().optional(),
    highValue: z.boolean().optional(),
    preferredSupplierIds: z.array(inventoryObjectIdSchema).max(100).optional(),
    supplierCatalogueEntries: z.array(supplierCatalogueEntryInputSchema).max(100).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedVersion'),
    'At least one inventory item field must be changed',
  )
  .superRefine(validateItemBusinessRules);

export const supplierContactInputSchema = z
  .object({
    contactType: z.enum(supplierContactTypeValues),
    name: z.string().trim().min(2).max(200),
    designation: nullableText(1, 200),
    phone: nullableText(1, 50),
    email: z.string().trim().email().max(320).nullable().optional(),
    primary: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .strict();

export const supplierAddressInputSchema = z
  .object({
    addressType: z.enum(supplierAddressTypeValues),
    line1: z.string().trim().min(1).max(300),
    line2: nullableText(1, 300),
    city: z.string().trim().min(1).max(150),
    district: nullableText(1, 150),
    province: nullableText(1, 150),
    postalCode: nullableText(1, 30),
    countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).default('PK'),
    primary: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .strict();

function validateSupplierCollections(
  value: {
    contacts?: readonly { primary: boolean; active: boolean }[];
    addresses?: readonly { primary: boolean; active: boolean }[];
  },
  context: z.RefinementCtx,
): void {
  if ((value.contacts ?? []).filter((entry) => entry.primary && entry.active).length > 1) {
    context.addIssue({
      code: 'custom',
      path: ['contacts'],
      message: 'Only one active primary supplier contact is allowed',
    });
  }

  if ((value.addresses ?? []).filter((entry) => entry.primary && entry.active).length > 1) {
    context.addIssue({
      code: 'custom',
      path: ['addresses'],
      message: 'Only one active primary supplier address is allowed',
    });
  }
}

export const createSupplierBodySchema = z
  .object({
    supplierCode: codeSchema,
    legalName: z.string().trim().min(2).max(500),
    tradingName: nullableText(1, 500),
    registrationNumber: nullableText(1, 120),
    taxRegistrationNumber: nullableText(1, 120),
    salesTaxRegistrationNumber: nullableText(1, 120),
    drugSaleLicenseNumber: nullableText(1, 120),
    contacts: z.array(supplierContactInputSchema).max(50).default([]),
    addresses: z.array(supplierAddressInputSchema).max(20).default([]),
    defaultCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()).default('PKR'),
    paymentTermsDays: z.number().int().min(0).max(3_650).default(0),
    standardLeadTimeDays: z.number().int().min(0).max(3_650).default(0),
    notes: nullableText(1, 5_000),
  })
  .strict()
  .superRefine(validateSupplierCollections);

export const updateSupplierBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    legalName: z.string().trim().min(2).max(500).optional(),
    tradingName: nullableText(1, 500),
    registrationNumber: nullableText(1, 120),
    taxRegistrationNumber: nullableText(1, 120),
    salesTaxRegistrationNumber: nullableText(1, 120),
    drugSaleLicenseNumber: nullableText(1, 120),
    contacts: z.array(supplierContactInputSchema).max(50).optional(),
    addresses: z.array(supplierAddressInputSchema).max(20).optional(),
    defaultCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
    paymentTermsDays: z.number().int().min(0).max(3_650).optional(),
    standardLeadTimeDays: z.number().int().min(0).max(3_650).optional(),
    notes: nullableText(1, 5_000),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedVersion'),
    'At least one supplier field must be changed',
  )
  .superRefine(validateSupplierCollections);

export const changeSupplierStatusBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    status: z.enum(supplierStatusValues),
    reason: inventoryReasonSchema,
  })
  .strict();

function validateLocation(
  value: {
    locationType?: string;
    wardId?: string | null;
    departmentId?: string | null;
    supportsDispensing?: boolean;
  },
  context: z.RefinementCtx,
): void {
  if (value.locationType === 'PHARMACY' && value.supportsDispensing !== true) {
    context.addIssue({
      code: 'custom',
      path: ['supportsDispensing'],
      message: 'Pharmacy locations must support dispensing',
    });
  }

  if (value.locationType === 'WARD_STORE' && value.wardId == null) {
    context.addIssue({
      code: 'custom',
      path: ['wardId'],
      message: 'Ward-store locations require a ward link',
    });
  }

  if (value.locationType === 'DEPARTMENT_STORE' && value.departmentId == null) {
    context.addIssue({
      code: 'custom',
      path: ['departmentId'],
      message: 'Department-store locations require a department link',
    });
  }

  if (
    value.supportsDispensing === true &&
    ['QUARANTINE', 'DAMAGED', 'RETURNS', 'IN_TRANSIT'].includes(value.locationType ?? '')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['supportsDispensing'],
      message: 'Restricted inventory locations cannot support dispensing',
    });
  }
}

export const createInventoryLocationBodySchema = z
  .object({
    locationCode: codeSchema,
    name: z.string().trim().min(2).max(300),
    locationType: z.enum(inventoryLocationTypeValues),
    parentLocationId: nullableObjectIdSchema,
    departmentId: nullableObjectIdSchema,
    wardId: nullableObjectIdSchema,
    servicePointId: nullableObjectIdSchema,
    managerStaffId: nullableObjectIdSchema,
    storageConditions: z.array(z.enum(inventoryStorageConditionValues)).min(1).max(20).default(['AMBIENT']),
    supportsDispensing: z.boolean().default(false),
    allowsControlledMedicine: z.boolean().default(false),
    allowsGeneralStock: z.boolean().default(true),
    stockOwnershipCode: codeSchema,
    physicalAddress: nullableText(1, 1_000),
    contactPhone: nullableText(1, 50),
    displayOrder: z.number().int().min(0).max(100_000).default(0),
  })
  .strict()
  .superRefine(validateLocation);

export const updateInventoryLocationBodySchema = z
  .object({
    expectedVersion: inventoryExpectedVersionSchema,
    name: z.string().trim().min(2).max(300).optional(),
    parentLocationId: nullableObjectIdSchema,
    departmentId: nullableObjectIdSchema,
    wardId: nullableObjectIdSchema,
    servicePointId: nullableObjectIdSchema,
    managerStaffId: nullableObjectIdSchema,
    storageConditions: z.array(z.enum(inventoryStorageConditionValues)).min(1).max(20).optional(),
    supportsDispensing: z.boolean().optional(),
    allowsControlledMedicine: z.boolean().optional(),
    allowsGeneralStock: z.boolean().optional(),
    physicalAddress: nullableText(1, 1_000),
    contactPhone: nullableText(1, 50),
    displayOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'expectedVersion'),
    'At least one inventory-location field must be changed',
  );

export const inventoryCategoryListQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    search: z.string().trim().min(1).max(200).optional(),
    parentCategoryId: z.union([inventoryObjectIdSchema, z.literal('root').transform(() => null)]).optional(),
    categoryType: z.enum(inventoryCategoryTypeValues).optional(),
    status: z.enum(inventoryCatalogStatusValues).optional(),
    sortBy: z.enum(INVENTORY_CATEGORY_SORT_FIELDS).default('displayOrder'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export const inventoryItemListQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    search: z.string().trim().min(1).max(200).optional(),
    categoryId: inventoryObjectIdSchema.optional(),
    itemType: z.enum(inventoryItemTypeValues).optional(),
    formularyItemId: inventoryObjectIdSchema.optional(),
    supplierId: inventoryObjectIdSchema.optional(),
    status: z.enum(inventoryCatalogStatusValues).optional(),
    controlledMedicine: booleanQuerySchema,
    highAlert: booleanQuerySchema,
    highValue: booleanQuerySchema,
    batchTrackingRequired: booleanQuerySchema,
    sortBy: z.enum(INVENTORY_ITEM_SORT_FIELDS).default('name'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export const supplierListQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    search: z.string().trim().min(1).max(200).optional(),
    status: z.enum(supplierStatusValues).optional(),
    sortBy: z.enum(INVENTORY_SUPPLIER_SORT_FIELDS).default('legalName'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export const inventoryLocationListQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    search: z.string().trim().min(1).max(200).optional(),
    parentLocationId: z.union([inventoryObjectIdSchema, z.literal('root').transform(() => null)]).optional(),
    locationType: z.enum(inventoryLocationTypeValues).optional(),
    departmentId: inventoryObjectIdSchema.optional(),
    wardId: inventoryObjectIdSchema.optional(),
    status: z.enum(inventoryCatalogStatusValues).optional(),
    supportsDispensing: booleanQuerySchema,
    sortBy: z.enum(INVENTORY_LOCATION_SORT_FIELDS).default('displayOrder'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export const inventoryBatchListQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    itemId: inventoryObjectIdSchema.optional(),
    supplierId: inventoryObjectIdSchema.optional(),
    status: z.enum(inventoryBatchStatusValues).optional(),
    inspectionStatus: z.enum(inventoryBatchInspectionStatusValues).optional(),
    recallStatus: z.enum(inventoryRecallStatusValues).optional(),
    expiresFrom: inventoryIsoDateTimeSchema.optional(),
    expiresTo: inventoryIsoDateTimeSchema.optional(),
    includeExpired: booleanQuerySchema,
    sortBy: z.enum(INVENTORY_BATCH_SORT_FIELDS).default('expiryDate'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict()
  .refine(
    (value) => value.expiresFrom === undefined || value.expiresTo === undefined || new Date(value.expiresFrom) <= new Date(value.expiresTo),
    {
      path: ['expiresTo'],
      message: 'Expiry range end must be on or after its start',
    },
  );

export const stockBalanceListQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    locationId: inventoryObjectIdSchema.optional(),
    itemId: inventoryObjectIdSchema.optional(),
    batchId: z.union([inventoryObjectIdSchema, z.literal('none').transform(() => null)]).optional(),
    onlyAvailable: booleanQuerySchema,
    onlyRestricted: booleanQuerySchema,
    sortBy: z.enum(STOCK_BALANCE_SORT_FIELDS).default('updatedAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const inventoryUnitConversionBodySchema = z
  .object({
    quantity: inventoryNonNegativeDecimalStringSchema,
    fromUnitId: inventoryObjectIdSchema,
    toUnitId: inventoryObjectIdSchema,
  })
  .strict();

export type CreateInventoryCategoryBody = z.infer<typeof createInventoryCategoryBodySchema>;
export type UpdateInventoryCategoryBody = z.infer<typeof updateInventoryCategoryBodySchema>;
export type CreateInventoryItemBody = z.infer<typeof createInventoryItemBodySchema>;
export type UpdateInventoryItemBody = z.infer<typeof updateInventoryItemBodySchema>;
export type CreateSupplierBody = z.infer<typeof createSupplierBodySchema>;
export type UpdateSupplierBody = z.infer<typeof updateSupplierBodySchema>;
export type CreateInventoryLocationBody = z.infer<typeof createInventoryLocationBodySchema>;
export type UpdateInventoryLocationBody = z.infer<typeof updateInventoryLocationBodySchema>;
import type {
  LaboratoryResultFlag,
  LaboratoryResultStatus,
} from '@hospital-mis/database';

import type {
  LaboratoryOrderItemRecord,
  LaboratoryResultComponentRecord,
  LaboratoryResultRecord,
  LaboratoryResultVersionRecord,
} from './laboratory.persistence.types.js';

import type {
  LaboratoryResultValueInput,
} from './laboratory.types.js';

import {
  laboratoryContentHash,
  laboratoryDecimal128,
  normalizeLaboratoryCode,
  normalizeNullableLaboratoryText,
} from './laboratory.normalization.js';

import {
  LaboratoryResultComponentDefinitionError,
  LaboratoryResultSnapshotIntegrityError,
} from './laboratory-result.errors.js';

import {
  LABORATORY_CRITICAL_RESULT_FLAGS,
} from './laboratory-result.transaction.constants.js';

interface ComponentDefinitionSnapshot {
  componentCode:
    string;

  name:
    string;

  valueType:
    LaboratoryResultComponentRecord['valueType'];

  unitCode:
    string | null;

  unitName:
    string | null;

  decimalScale:
    number;

  required:
    boolean;

  displayOrder:
    number;

  structuredSchemaKey:
    string | null;

  referenceRangesSnapshot?:
    readonly unknown[];

  referenceRanges?:
    readonly unknown[];
}

interface ReferenceRangeSnapshot {
  rangeCode?:
    string;

  lowerBound?:
    unknown;

  upperBound?:
    unknown;

  criticalLowerBound?:
    unknown;

  criticalUpperBound?:
    unknown;

  textualReference?:
    string | null;

  codedValues?:
    readonly {
      code?:
        string;

      display?:
        string;

      normal?:
        boolean;
    }[];
}

export interface LaboratoryVerifiedResultSnapshot {
  schemaVersion:
    1;

  resultId:
    string;

  resultNumber:
    string;

  labOrderId:
    string;

  labOrderItemId:
    string;

  labTestId:
    string;

  specimenId:
    string | null;

  patientId:
    string;

  encounterId:
    string;

  testCode:
    string;

  testName:
    string;

  methodCode:
    string | null;

  methodName:
    string | null;

  versionNumber:
    number;

  status:
    Extract<
      LaboratoryResultStatus,
      'VERIFIED' | 'CORRECTED'
    >;

  components:
    readonly {
      componentCode:
        string;

      componentName:
        string;

      valueType:
        LaboratoryResultComponentRecord['valueType'];

      numericValue:
        string | null;

      textValue:
        string | null;

      codedValue:
        | {
            code:
              string;

            display:
              string;

            codingSystem:
              string | null;
          }
        | null;

      qualitativeValue:
        string | null;

      structuredValue:
        unknown;

      unitCode:
        string | null;

      unitName:
        string | null;

      referenceRange:
        | {
            rangeCode:
              string;

            displayText:
              string;

            lowerBound:
              string | null;

            upperBound:
              string | null;

            criticalLowerBound:
              string | null;

            criticalUpperBound:
              string | null;
          }
        | null;

      flag:
        LaboratoryResultFlag;

      interpretation:
        string | null;

      displayOrder:
        number;
    }[];

  overallFlag:
    LaboratoryResultFlag;

  criticalComponentCount:
    number;

  conclusion:
    string | null;

  technicalNotes:
    string | null;

  enteredAt:
    string;

  enteredBy:
    string;

  technicianStaffId:
    string;

  validatedAt:
    string;

  validatedBy:
    string;

  validatorStaffId:
    string;

  verifiedAt:
    string;

  verifiedBy:
    string;

  verifierStaffId:
    string;

  correctionReason:
    string | null;

  recordedAt:
    string;
}

function decimalString(
  value:
    unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value ===
      'object' &&
    'toString' in value &&
    typeof value.toString ===
      'function'
  ) {
    return value.toString();
  }

  if (
    typeof value ===
      'string' ||
    typeof value ===
      'number'
  ) {
    return String(
      value,
    );
  }

  return null;
}

function firstReferenceRange(
  definition:
    ComponentDefinitionSnapshot,
): ReferenceRangeSnapshot | null {
  const ranges =
    definition
      .referenceRangesSnapshot ??
    definition
      .referenceRanges ??
    [];

  const first =
    ranges[0];

  return (
    first !==
      undefined &&
    first !==
      null &&
    typeof first ===
      'object'
  )
    ? first as
        ReferenceRangeSnapshot
    : null;
}

function referenceRangeDisplay(
  range:
    ReferenceRangeSnapshot,
): string {
  if (
    range.textualReference !==
      undefined &&
    range.textualReference !==
      null
  ) {
    return range
      .textualReference;
  }

  const lower =
    decimalString(
      range.lowerBound,
    );

  const upper =
    decimalString(
      range.upperBound,
    );

  if (
    lower !==
      null &&
    upper !==
      null
  ) {
    return `${lower} – ${upper}`;
  }

  if (
    lower !==
    null
  ) {
    return `≥ ${lower}`;
  }

  if (
    upper !==
    null
  ) {
    return `≤ ${upper}`;
  }

  const coded =
    range
      .codedValues
      ?.filter(
        (value) =>
          value.normal ===
          true,
      )
      .map(
        (value) =>
          value.display ??
          value.code ??
          '',
      )
      .filter(
        (value) =>
          value.length >
          0,
      )
      .join(', ') ??
    '';

  return coded.length >
    0
    ? coded
    : 'Not specified';
}

function numericFlag(
  value:
    string,

  range:
    ReferenceRangeSnapshot | null,

  fallback:
    LaboratoryResultFlag,
): LaboratoryResultFlag {
  if (
    range ===
    null
  ) {
    return fallback;
  }

  const numeric =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      numeric,
    )
  ) {
    return fallback;
  }

  const criticalLower =
    decimalString(
      range
        .criticalLowerBound,
    );

  const criticalUpper =
    decimalString(
      range
        .criticalUpperBound,
    );

  const lower =
    decimalString(
      range.lowerBound,
    );

  const upper =
    decimalString(
      range.upperBound,
    );

  if (
    criticalLower !==
      null &&
    numeric <
      Number(
        criticalLower,
      )
  ) {
    return 'CRITICAL_LOW';
  }

  if (
    criticalUpper !==
      null &&
    numeric >
      Number(
        criticalUpper,
      )
  ) {
    return 'CRITICAL_HIGH';
  }

  if (
    lower !==
      null &&
    numeric <
      Number(
        lower,
      )
  ) {
    return 'LOW';
  }

  if (
    upper !==
      null &&
    numeric >
      Number(
        upper,
      )
  ) {
    return 'HIGH';
  }

  if (
    lower !==
      null ||
    upper !==
      null
  ) {
    return 'NORMAL';
  }

  return fallback;
}

function codedFlag(
  code:
    string,

  display:
    string,

  range:
    ReferenceRangeSnapshot | null,

  fallback:
    LaboratoryResultFlag,
): LaboratoryResultFlag {
  if (
    range
      ?.codedValues ===
    undefined
  ) {
    return fallback;
  }

  const normalizedCode =
    code
      .trim()
      .toUpperCase();

  const normalizedDisplay =
    display
      .trim()
      .toLowerCase();

  const match =
    range
      .codedValues
      .find(
        (candidate) =>
          candidate
            .code
            ?.trim()
            .toUpperCase() ===
            normalizedCode ||
          candidate
            .display
            ?.trim()
            .toLowerCase() ===
            normalizedDisplay,
      );

  if (
    match ===
    undefined
  ) {
    return fallback;
  }

  return match.normal ===
    true
    ? 'NORMAL'
    : 'ABNORMAL';
}

export function mapLaboratoryResultComponents(
  item:
    LaboratoryOrderItemRecord,

  inputs:
    readonly LaboratoryResultValueInput[],
): LaboratoryResultComponentRecord[] {
  const definitions =
    item
      .resultComponentsSnapshot as unknown as
      readonly ComponentDefinitionSnapshot[];

  const definitionByCode =
    new Map(
      definitions.map(
        (definition) => [
          normalizeLaboratoryCode(
            definition.componentCode,
          ),

          definition,
        ],
      ),
    );

  const inputByCode =
    new Map<
      string,
      LaboratoryResultValueInput
    >();

  for (
    const input of
    inputs
  ) {
    const code =
      normalizeLaboratoryCode(
        input.componentCode,
      );

    if (
      inputByCode.has(
        code,
      )
    ) {
      throw new LaboratoryResultComponentDefinitionError(
        `Duplicate Laboratory result component ${code}`,
      );
    }

    inputByCode.set(
      code,
      input,
    );
  }

  for (
    const definition of
    definitions
  ) {
    const code =
      normalizeLaboratoryCode(
        definition.componentCode,
      );

    if (
      definition.required &&
      !inputByCode.has(
        code,
      )
    ) {
      throw new LaboratoryResultComponentDefinitionError(
        `Required Laboratory result component ${code} is missing`,
      );
    }
  }

  for (
    const code of
    inputByCode.keys()
  ) {
    if (
      !definitionByCode.has(
        code,
      )
    ) {
      throw new LaboratoryResultComponentDefinitionError(
        `Laboratory result component ${code} is not part of the ordered standardized test snapshot`,
      );
    }
  }

  return [
    ...inputByCode.entries(),
  ]
    .map(
      (
        [
          code,
          input,
        ],
      ) => {
        const definition =
          definitionByCode.get(
            code,
          );

        if (
          definition ===
          undefined
        ) {
          throw new LaboratoryResultComponentDefinitionError(
            `Laboratory result component ${code} is not defined`,
          );
        }

        if (
          input.valueType !==
          definition.valueType
        ) {
          throw new LaboratoryResultComponentDefinitionError(
            `Laboratory result component ${code} requires ${definition.valueType} values`,
          );
        }

        const range =
          firstReferenceRange(
            definition,
          );

        const lowerBound =
          decimalString(
            range?.lowerBound,
          );

        const upperBound =
          decimalString(
            range?.upperBound,
          );

        const criticalLowerBound =
          decimalString(
            range
              ?.criticalLowerBound,
          );

        const criticalUpperBound =
          decimalString(
            range
              ?.criticalUpperBound,
          );

        const rangeSnapshot =
          range ===
            null
            ? null
            : {
                rangeCode:
                  normalizeLaboratoryCode(
                    range
                      .rangeCode ??
                    'DEFAULT',
                  ),

                displayText:
                  referenceRangeDisplay(
                    range,
                  ),

                lowerBound:
                  lowerBound ===
                    null
                    ? null
                    : laboratoryDecimal128(
                        lowerBound,
                      ),

                upperBound:
                  upperBound ===
                    null
                    ? null
                    : laboratoryDecimal128(
                        upperBound,
                      ),

                criticalLowerBound:
                  criticalLowerBound ===
                    null
                    ? null
                    : laboratoryDecimal128(
                        criticalLowerBound,
                      ),

                criticalUpperBound:
                  criticalUpperBound ===
                    null
                    ? null
                    : laboratoryDecimal128(
                        criticalUpperBound,
                      ),
              };

        const fallbackFlag =
          input.flag ??
          'NOT_APPLICABLE';

        let flag =
          fallbackFlag;

        if (
          input.valueType ===
          'NUMERIC'
        ) {
          if (
            definition.unitCode !==
              null &&
            normalizeLaboratoryCode(
              input.unitCode,
            ) !==
              normalizeLaboratoryCode(
                definition.unitCode,
              )
          ) {
            throw new LaboratoryResultComponentDefinitionError(
              `Laboratory result component ${code} requires unit ${definition.unitCode}`,
            );
          }

          flag =
            numericFlag(
              input.numericValue,
              range,
              fallbackFlag,
            );
        } else if (
          input.valueType ===
          'CODED'
        ) {
          flag =
            codedFlag(
              input
                .codedValue
                .code,

              input
                .codedValue
                .display,

              range,

              fallbackFlag,
            );
        } else if (
          input.valueType ===
          'QUALITATIVE'
        ) {
          flag =
            codedFlag(
              input
                .qualitativeValue,

              input
                .qualitativeValue,

              range,

              fallbackFlag,
            );
        }

        return {
          componentCode:
            code,

          componentNameSnapshot:
            definition.name,

          valueType:
            definition.valueType,

          numericValue:
            input.valueType ===
              'NUMERIC'
              ? laboratoryDecimal128(
                  input.numericValue,
                )
              : null,

          textValue:
            input.valueType ===
              'TEXT'
              ? input.textValue
              : null,

          codedValue:
            input.valueType ===
              'CODED'
              ? {
                  code:
                    input
                      .codedValue
                      .code
                      .trim(),

                  display:
                    input
                      .codedValue
                      .display
                      .trim(),

                  codingSystem:
                    normalizeNullableLaboratoryText(
                      input
                        .codedValue
                        .codingSystem,
                    ),
                }
              : null,

          qualitativeValue:
            input.valueType ===
              'QUALITATIVE'
              ? input
                  .qualitativeValue
                  .trim()
              : null,

          structuredValue:
            input.valueType ===
              'STRUCTURED'
              ? input
                  .structuredValue
              : null,

          unitCodeSnapshot:
            input.valueType ===
              'NUMERIC'
              ? normalizeLaboratoryCode(
                  input.unitCode,
                )
              : definition
                  .unitCode,

          unitNameSnapshot:
            input.valueType ===
              'NUMERIC'
              ? input
                  .unitName
                  .trim()
              : definition
                  .unitName,

          referenceRangeSnapshot:
            rangeSnapshot,

          flag,

          interpretation:
            normalizeNullableLaboratoryText(
              input.interpretation,
            ),

          displayOrder:
            definition.displayOrder,
        } satisfies LaboratoryResultComponentRecord;
      },
    )
    .sort(
      (
        left,
        right,
      ) =>
        left.displayOrder -
          right.displayOrder ||
        left.componentCode.localeCompare(
          right.componentCode,
        ),
    );
}

const flagPriority: Readonly<
  Record<
    LaboratoryResultFlag,
    number
  >
> = {
  CRITICAL:
    100,

  CRITICAL_HIGH:
    100,

  CRITICAL_LOW:
    100,

  ABNORMAL:
    70,

  HIGH:
    60,

  LOW:
    60,

  INDETERMINATE:
    50,

  NORMAL:
    10,

  NOT_APPLICABLE:
    0,
};

export function summarizeLaboratoryResultFlags(
  components:
    readonly LaboratoryResultComponentRecord[],
): {
  overallFlag:
    LaboratoryResultFlag;

  criticalComponentCount:
    number;
} {
  const criticalComponentCount =
    components.filter(
      (component) =>
        LABORATORY_CRITICAL_RESULT_FLAGS.includes(
          component.flag as
            (typeof LABORATORY_CRITICAL_RESULT_FLAGS)[number],
        ),
    ).length;

  const overallFlag =
    components.reduce<
      LaboratoryResultFlag
    >(
      (
        selected,
        component,
      ) =>
        flagPriority[
          component.flag
        ] >
        flagPriority[
          selected
        ]
          ? component.flag
          : selected,

      'NOT_APPLICABLE',
    );

  return {
    overallFlag,

    criticalComponentCount,
  };
}

export function laboratoryResultVersionAssociatedData(
  facilityId:
    string,

  resultId:
    string,

  versionNumber:
    number,
): string {
  return [
    'hospital-mis',
    'laboratory',
    'result-version',
    facilityId,
    resultId,
    String(
      versionNumber,
    ),
  ].join(':');
}

function id(
  value:
    | {
        toHexString():
          string;
      }
    | null,
): string | null {
  return value
    ?.toHexString() ??
    null;
}

export function createLaboratoryVerifiedResultSnapshot(
  input: Readonly<{
    result:
      LaboratoryResultRecord;

    versionNumber:
      number;

    status:
      Extract<
        LaboratoryResultStatus,
        'VERIFIED' | 'CORRECTED'
      >;

    verifierUserId:
      string;

    verifierStaffId:
      string;

    validatorStaffId:
      string;

    recordedAt:
      Date;

    correctionReason?:
      string | null;
  }>,
): LaboratoryVerifiedResultSnapshot {
  const result =
    input.result;

  if (
    result.enteredAt ===
      null ||
    result.enteredBy ===
      null ||
    result.technicianStaffId ===
      null ||
    result.validatedAt ===
      null ||
    result.validatedBy ===
      null
  ) {
    throw new LaboratoryResultSnapshotIntegrityError(
      'Laboratory result attribution is incomplete before snapshot creation',
    );
  }

  return {
    schemaVersion:
      1,

    resultId:
      result
        ._id
        .toHexString(),

    resultNumber:
      result.resultNumber,

    labOrderId:
      result
        .labOrderId
        .toHexString(),

    labOrderItemId:
      result
        .labOrderItemId
        .toHexString(),

    labTestId:
      result
        .labTestId
        .toHexString(),

    specimenId:
      id(
        result.specimenId,
      ),

    patientId:
      result
        .patientId
        .toHexString(),

    encounterId:
      result
        .encounterId
        .toHexString(),

    testCode:
      result
        .testCodeSnapshot,

    testName:
      result
        .testNameSnapshot,

    methodCode:
      result
        .methodCodeSnapshot,

    methodName:
      result
        .methodNameSnapshot,

    versionNumber:
      input.versionNumber,

    status:
      input.status,

    components:
      result.components.map(
        (component) => ({
          componentCode:
            component.componentCode,

          componentName:
            component
              .componentNameSnapshot,

          valueType:
            component.valueType,

          numericValue:
            component
              .numericValue
              ?.toString() ??
            null,

          textValue:
            component.textValue,

          codedValue:
            component.codedValue,

          qualitativeValue:
            component
              .qualitativeValue,

          structuredValue:
            component
              .structuredValue,

          unitCode:
            component
              .unitCodeSnapshot,

          unitName:
            component
              .unitNameSnapshot,

          referenceRange:
            component
              .referenceRangeSnapshot ===
              null
              ? null
              : {
                  rangeCode:
                    component
                      .referenceRangeSnapshot
                      .rangeCode,

                  displayText:
                    component
                      .referenceRangeSnapshot
                      .displayText,

                  lowerBound:
                    component
                      .referenceRangeSnapshot
                      .lowerBound
                      ?.toString() ??
                    null,

                  upperBound:
                    component
                      .referenceRangeSnapshot
                      .upperBound
                      ?.toString() ??
                    null,

                  criticalLowerBound:
                    component
                      .referenceRangeSnapshot
                      .criticalLowerBound
                      ?.toString() ??
                    null,

                  criticalUpperBound:
                    component
                      .referenceRangeSnapshot
                      .criticalUpperBound
                      ?.toString() ??
                    null,
                },

          flag:
            component.flag,

          interpretation:
            component
              .interpretation,

          displayOrder:
            component
              .displayOrder,
        }),
      ),

    overallFlag:
      result.overallFlag,

    criticalComponentCount:
      result
        .criticalComponentCount,

    conclusion:
      result.conclusion,

    technicalNotes:
      result.technicalNotes,

    enteredAt:
      result
        .enteredAt
        .toISOString(),

    enteredBy:
      result
        .enteredBy
        .toHexString(),

    technicianStaffId:
      result
        .technicianStaffId
        .toHexString(),

    validatedAt:
      result
        .validatedAt
        .toISOString(),

    validatedBy:
      result
        .validatedBy
        .toHexString(),

    validatorStaffId:
      input.validatorStaffId,

    verifiedAt:
      input
        .recordedAt
        .toISOString(),

    verifiedBy:
      input.verifierUserId,

    verifierStaffId:
      input.verifierStaffId,

    correctionReason:
      input.correctionReason ??
      null,

    recordedAt:
      input
        .recordedAt
        .toISOString(),
  };
}

export function laboratoryResultSnapshotContentHash(
  snapshot:
    LaboratoryVerifiedResultSnapshot,
): string {
  return laboratoryContentHash(
    snapshot,
  );
}

export function assertLaboratoryResultSnapshotIntegrity(
  input: Readonly<{
    snapshot:
      LaboratoryVerifiedResultSnapshot;

    version:
      LaboratoryResultVersionRecord;

    associatedData:
      string;

    matchesHash(
      value:
        unknown,

      associatedData:
        string,

      expectedHash:
        string,
    ): boolean;
  }>,
): void {
  if (
    !input.matchesHash(
      input.snapshot,
      input.associatedData,
      input.version.snapshotHash,
    )
  ) {
    throw new LaboratoryResultSnapshotIntegrityError();
  }

  if (
    laboratoryResultSnapshotContentHash(
      input.snapshot,
    ) !==
    input.version.contentHash
  ) {
    throw new LaboratoryResultSnapshotIntegrityError();
  }
}

export function safeLaboratoryResultAuditSnapshot(
  result:
    LaboratoryResultRecord,
): Record<string, unknown> {
  return {
    resultId:
      result
        ._id
        .toHexString(),

    resultNumber:
      result.resultNumber,

    orderId:
      result
        .labOrderId
        .toHexString(),

    orderItemId:
      result
        .labOrderItemId
        .toHexString(),

    encounterId:
      result
        .encounterId
        .toHexString(),

    patientId:
      result
        .patientId
        .toHexString(),

    testCode:
      result
        .testCodeSnapshot,

    status:
      result.status,

    publicationStatus:
      result
        .publicationStatus,

    overallFlag:
      result.overallFlag,

    componentCount:
      result
        .components
        .length,

    criticalComponentCount:
      result
        .criticalComponentCount,

    unresolvedCriticalComponentCount:
      result
        .unresolvedCriticalComponentCount,

    currentVersion:
      result.currentVersion,

    enteredAt:
      result
        .enteredAt
        ?.toISOString() ??
      null,

    validatedAt:
      result
        .validatedAt
        ?.toISOString() ??
      null,

    verifiedAt:
      result
        .verifiedAt
        ?.toISOString() ??
      null,

    correctedAt:
      result
        .correctedAt
        ?.toISOString() ??
      null,

    publishedAt:
      result
        .publishedAt
        ?.toISOString() ??
      null,

    withdrawnAt:
      result
        .withdrawnAt
        ?.toISOString() ??
      null,

    version:
      result.version,
  };
}

export function safeLaboratoryResultEventPayload(
  result:
    LaboratoryResultRecord,
): Record<string, unknown> {
  return {
    resultId:
      result
        ._id
        .toHexString(),

    orderId:
      result
        .labOrderId
        .toHexString(),

    orderItemId:
      result
        .labOrderItemId
        .toHexString(),

    encounterId:
      result
        .encounterId
        .toHexString(),

    testCode:
      result
        .testCodeSnapshot,

    status:
      result.status,

    publicationStatus:
      result
        .publicationStatus,

    overallFlag:
      result.overallFlag,

    criticalComponentCount:
      result
        .criticalComponentCount,

    unresolvedCriticalComponentCount:
      result
        .unresolvedCriticalComponentCount,

    currentVersion:
      result.currentVersion,

    version:
      result.version,
  };
}
import {
  RequestValidationError,
} from '@hospital-mis/shared';

import type {
  ClinicalDocumentType,
} from '@hospital-mis/database';

import type {
  CreateClinicalNoteInput,
  RecordStructuredEncounterSectionInput,
  StructuredEncounterSectionKey,
} from '../clinical-emr.types.js';

interface StructuredSectionDefinition {
  documentType: ClinicalDocumentType;
  title: string;
  allowedFields: readonly string[];
  requiredAny: readonly string[];
}

const sectionDefinitions: Record<
  StructuredEncounterSectionKey,
  StructuredSectionDefinition
> = {
  CHIEF_COMPLAINT: {
    documentType: 'CHIEF_COMPLAINT',
    title: 'Chief complaint',
    allowedFields: [
      'complaints',
      'onset',
      'duration',
      'patientWords',
      'associatedSymptoms',
    ],
    requiredAny: ['complaints', 'patientWords'],
  },
  HISTORY_OF_PRESENTING_ILLNESS: {
    documentType: 'HISTORY_OF_PRESENTING_ILLNESS',
    title: 'History of presenting illness',
    allowedFields: [
      'onset',
      'chronology',
      'location',
      'quality',
      'severity',
      'context',
      'modifyingFactors',
      'associatedSymptoms',
      'narrative',
    ],
    requiredAny: ['chronology', 'narrative'],
  },
  PAST_MEDICAL_HISTORY: {
    documentType: 'PAST_MEDICAL_HISTORY',
    title: 'Past medical history',
    allowedFields: [
      'conditions',
      'hospitalizations',
      'immunizations',
      'transfusions',
      'screeningHistory',
    ],
    requiredAny: ['conditions', 'hospitalizations'],
  },
  PAST_SURGICAL_HISTORY: {
    documentType: 'PAST_SURGICAL_HISTORY',
    title: 'Past surgical history',
    allowedFields: [
      'procedures',
      'anaesthesiaHistory',
      'complications',
    ],
    requiredAny: ['procedures'],
  },
  FAMILY_HISTORY: {
    documentType: 'FAMILY_HISTORY',
    title: 'Family history',
    allowedFields: [
      'relatives',
      'hereditaryRisks',
      'consanguinity',
    ],
    requiredAny: ['relatives', 'hereditaryRisks'],
  },
  SOCIAL_HISTORY: {
    documentType: 'SOCIAL_HISTORY',
    title: 'Social history',
    allowedFields: [
      'tobacco',
      'alcohol',
      'substances',
      'occupation',
      'livingSituation',
      'diet',
      'exercise',
      'travel',
      'safety',
    ],
    requiredAny: [
      'tobacco',
      'alcohol',
      'substances',
      'occupation',
      'livingSituation',
    ],
  },
  CURRENT_MEDICATIONS: {
    documentType: 'CURRENT_MEDICATIONS',
    title: 'Current medications',
    allowedFields: [
      'medications',
      'adherence',
      'medicationSource',
      'reconciliationStatus',
    ],
    requiredAny: ['medications'],
  },
  REVIEW_OF_SYSTEMS: {
    documentType: 'REVIEW_OF_SYSTEMS',
    title: 'Review of systems',
    allowedFields: [
      'systems',
      'generalComments',
      'unableToAssess',
    ],
    requiredAny: ['systems', 'generalComments'],
  },
  PHYSICAL_EXAMINATION: {
    documentType: 'PHYSICAL_EXAMINATION',
    title: 'Physical examination',
    allowedFields: [
      'generalAppearance',
      'systems',
      'findings',
      'limitations',
    ],
    requiredAny: ['generalAppearance', 'systems', 'findings'],
  },
  ASSESSMENT: {
    documentType: 'ASSESSMENT',
    title: 'Clinical assessment',
    allowedFields: [
      'assessments',
      'clinicalImpression',
      'riskAssessment',
      'differentials',
    ],
    requiredAny: ['assessments', 'clinicalImpression'],
  },
  PLAN: {
    documentType: 'PLAN',
    title: 'Clinical plan',
    allowedFields: [
      'investigations',
      'treatments',
      'medications',
      'monitoring',
      'counselling',
      'disposition',
    ],
    requiredAny: [
      'investigations',
      'treatments',
      'medications',
      'monitoring',
      'disposition',
    ],
  },
  PROCEDURES_AND_INTERVENTIONS: {
    documentType: 'PROCEDURE_NOTE',
    title: 'Procedures and interventions',
    allowedFields: [
      'procedures',
      'interventions',
      'consent',
      'anaesthesia',
      'findings',
      'outcomes',
      'complications',
    ],
    requiredAny: ['procedures', 'interventions'],
  },
  FOLLOW_UP_INSTRUCTIONS: {
    documentType: 'FOLLOW_UP_INSTRUCTIONS',
    title: 'Follow-up instructions',
    allowedFields: [
      'interval',
      'destination',
      'instructions',
      'redFlags',
      'returnPrecautions',
      'contactPlan',
    ],
    requiredAny: ['interval', 'instructions', 'returnPrecautions'],
  },
};

const forbiddenKeys = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

function validationError(
  path: string,
  message: string,
): RequestValidationError {
  return new RequestValidationError([
    {
      code: 'invalid_clinical_section',
      message,
      path,
    },
  ]);
}

function normalizeNarrative(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value
    .normalize('NFKC')
    .replaceAll(/\r\n?/gu, '\n')
    .trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > 200_000) {
    throw validationError(
      'body.narrativeText',
      'Clinical narrative exceeds the maximum supported length',
    );
  }

  return normalized;
}

function assertSafeStructuredValue(
  value: unknown,
  path: string,
  depth: number,
): void {
  if (depth > 8) {
    throw validationError(
      path,
      'Structured clinical data exceeds the maximum nesting depth',
    );
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    if (typeof value === 'string' && value.length > 20_000) {
      throw validationError(
        path,
        'Structured clinical text exceeds the maximum supported length',
      );
    }
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw validationError(path, 'Numeric clinical values must be finite');
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > 500) {
      throw validationError(
        path,
        'Structured clinical arrays cannot contain more than 500 items',
      );
    }

    value.forEach((item, index) =>
      assertSafeStructuredValue(item, `${path}.${index}`, depth + 1),
    );
    return;
  }

  if (typeof value !== 'object') {
    throw validationError(path, 'Unsupported structured clinical value');
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw validationError(path, 'Structured clinical objects must be plain objects');
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) {
      throw validationError(
        `${path}.${key}`,
        'Unsafe structured clinical key is not permitted',
      );
    }

    assertSafeStructuredValue(child, `${path}.${key}`, depth + 1);
  }
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return true;
}

export class StructuredEncounterSectionService {
  public buildClinicalNoteInput(
    input: RecordStructuredEncounterSectionInput,
  ): CreateClinicalNoteInput {
    const definition = sectionDefinitions[input.sectionKey];
    const narrativeText = normalizeNarrative(input.narrativeText);
    const structuredData = input.structuredData == null
      ? null
      : JSON.parse(JSON.stringify(input.structuredData)) as Record<string, unknown>;

    if (structuredData !== null) {
      assertSafeStructuredValue(structuredData, 'body.structuredData', 0);

      const allowedFields = new Set(definition.allowedFields);
      for (const key of Object.keys(structuredData)) {
        if (!allowedFields.has(key)) {
          throw validationError(
            `body.structuredData.${key}`,
            `Field is not permitted for ${input.sectionKey}`,
          );
        }
      }

      const hasRequiredField = definition.requiredAny.some(
        (key) => hasMeaningfulValue(structuredData[key]),
      );

      if (!hasRequiredField && narrativeText === null) {
        throw validationError(
          'body.structuredData',
          `At least one clinically meaningful ${input.sectionKey} field is required`,
        );
      }

      const serializedLength = Buffer.byteLength(
        JSON.stringify(structuredData),
        'utf8',
      );
      if (serializedLength > 250_000) {
        throw validationError(
          'body.structuredData',
          'Structured clinical data exceeds the maximum supported size',
        );
      }
    }

    if (narrativeText === null && structuredData === null) {
      throw validationError(
        'body',
        'A clinical narrative or structured clinical data is required',
      );
    }

    return {
      encounterId: input.encounterId,
      authorProviderId: input.authorProviderId,
      documentType: definition.documentType,
      title: definition.title,
      narrativeText,
      structuredData,
      confidentiality: input.confidentiality ?? 'ROUTINE',
      restrictionReason: input.restrictionReason ?? null,
    };
  }

  public definition(
    sectionKey: StructuredEncounterSectionKey,
  ): Readonly<StructuredSectionDefinition> {
    return sectionDefinitions[sectionKey];
  }
}
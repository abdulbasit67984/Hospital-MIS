import {
  Types,
} from 'mongoose';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  assertLaboratorySpecimenTransition,
} from '../laboratory.lifecycle.js';

import {
  formatLaboratoryNumber,
} from '../laboratory.workflow-helpers.js';

import {
  laboratoryContentHash,
} from '../laboratory.normalization.js';

import {
  LaboratoryInvalidSpecimenTransitionError,
} from '../laboratory.errors.js';

describe(
  'Laboratory order and specimen workflow foundation',
  () => {
    it(
      'formats facility sequence values as stable Laboratory identifiers',
      () => {
        expect(
          formatLaboratoryNumber(
            'ACC',
            2026,
            37,
          ),
        ).toBe(
          'ACC-2026-0000037',
        );

        expect(
          formatLaboratoryNumber(
            'SP',
            2026,
            4,
          ),
        ).toBe(
          'SP-2026-0000004',
        );
      },
    );

    it(
      'permits only explicit specimen lifecycle transitions',
      () => {
        expect(() =>
          assertLaboratorySpecimenTransition(
            'PLANNED',
            'LABEL_PRINTED',
          ),
        ).not.toThrow();

        expect(() =>
          assertLaboratorySpecimenTransition(
            'LABEL_PRINTED',
            'COLLECTED',
          ),
        ).not.toThrow();

        expect(() =>
          assertLaboratorySpecimenTransition(
            'COLLECTED',
            'RECEIVED',
          ),
        ).not.toThrow();

        expect(() =>
          assertLaboratorySpecimenTransition(
            'COMPLETED',
            'REJECTED',
          ),
        ).toThrow(
          LaboratoryInvalidSpecimenTransitionError,
        );
      },
    );

    it(
      'creates deterministic status-history state hashes without exposing specimen notes',
      () => {
        const specimenId =
          new Types.ObjectId()
            .toHexString();

        const first =
          laboratoryContentHash({
            specimenId,
            status:
              'RECEIVED',
            version:
              3,
            occurredAt:
              new Date(
                '2026-07-19T10:00:00.000Z',
              ),
          });

        const second =
          laboratoryContentHash({
            occurredAt:
              new Date(
                '2026-07-19T10:00:00.000Z',
              ),
            version:
              3,
            status:
              'RECEIVED',
            specimenId,
          });

        expect(first).toBe(second);
        expect(first).toMatch(
          /^[a-f\d]{64}$/u,
        );
      },
    );

    it(
      'keeps accession, specimen, and order locks in separate namespaces',
      async () => {
        const module =
          await import(
            '../laboratory.constants.js'
          );

        expect(
          module
            .LABORATORY_LOCK_NAMESPACE
            .ORDER,
        ).not.toBe(
          module
            .LABORATORY_LOCK_NAMESPACE
            .SPECIMEN,
        );

        expect(
          module
            .LABORATORY_NUMBER_SEQUENCE_NAMESPACE
            .ACCESSION,
        ).not.toBe(
          module
            .LABORATORY_NUMBER_SEQUENCE_NAMESPACE
            .SPECIMEN,
        );
      },
    );
  },
);
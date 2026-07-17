import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  guardianSearchQuerySchema,
  patientProfileQuerySchema,
  patientSearchQuerySchema,
} from '../patient.query.validation.js';

describe(
  'patient query validation',
  () => {
    it(
      'normalizes pagination and boolean query values',
      () => {
        const result =
          patientSearchQuerySchema.parse({
            term:
              'Ayesha Khan',
            mode:
              'NAME',
            includeMerged:
              'false',
            isMinor:
              '1',
            page:
              '2',
            pageSize:
              '25',
          });

        expect(result).toMatchObject({
          includeMerged:
            false,
          isMinor:
            true,
          page:
            2,
          pageSize:
            25,
        });
      },
    );

    it(
      'rejects malformed CNIC searches',
      () => {
        const result =
          patientSearchQuerySchema.safeParse({
            term:
              '35202-1234',
            mode:
              'CNIC',
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      'applies privacy-safe profile defaults',
      () => {
        expect(
          patientProfileQuerySchema.parse({}),
        ).toEqual({
          includeInactiveContacts:
            false,
          includeInactiveAddresses:
            false,
          includeInactiveGuardians:
            false,
          includeResolvedAlerts:
            false,
        });
      },
    );

    it(
      'limits guardian result pages',
      () => {
        const result =
          guardianSearchQuerySchema.safeParse({
            pageSize:
              51,
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );
  },
);
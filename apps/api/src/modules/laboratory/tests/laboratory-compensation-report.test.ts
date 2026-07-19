import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  LaboratoryCompensationExecutor,
} from '../laboratory-compensation.executor.js';

import {
  LaboratoryReportRenderer,
} from '../services/laboratory-report.renderer.js';

import type {
  LaboratoryVerifiedResultSnapshot,
} from '../laboratory-result.workflow-helpers.js';

describe(
  'Laboratory recovery and reporting',
  () => {
    it(
      'renders a PDF only from immutable verified snapshot content',
      async () => {
        const renderer =
          new LaboratoryReportRenderer();

        const snapshot: LaboratoryVerifiedResultSnapshot = {
          schemaVersion: 1,
          resultId:
            '64b000000000000000000001',
          resultNumber:
            'RES-2026-0000001',
          labOrderId:
            '64b000000000000000000002',
          labOrderItemId:
            '64b000000000000000000003',
          labTestId:
            '64b000000000000000000004',
          specimenId:
            '64b000000000000000000005',
          patientId:
            '64b000000000000000000006',
          encounterId:
            '64b000000000000000000007',
          testCode:
            'CBC',
          testName:
            'Complete Blood Count',
          methodCode:
            'AUTO',
          methodName:
            'Automated',
          versionNumber: 1,
          status: 'VERIFIED',
          components: [
            {
              componentCode:
                'HGB',
              componentName:
                'Hemoglobin',
              valueType:
                'NUMERIC',
              numericValue:
                '12.7',
              textValue: null,
              codedValue: null,
              qualitativeValue: null,
              structuredValue: null,
              unitCode:
                'G_DL',
              unitName:
                'g/dL',
              referenceRange: {
                rangeCode:
                  'ADULT',
                displayText:
                  '12.0 – 16.0',
                lowerBound:
                  '12.0',
                upperBound:
                  '16.0',
                criticalLowerBound:
                  '6.0',
                criticalUpperBound:
                  '20.0',
              },
              flag: 'NORMAL',
              interpretation: null,
              displayOrder: 1,
            },
          ],
          overallFlag:
            'NORMAL',
          criticalComponentCount: 0,
          conclusion: null,
          technicalNotes: null,
          enteredAt:
            '2026-07-19T09:00:00.000Z',
          enteredBy:
            '64b000000000000000000008',
          technicianStaffId:
            '64b000000000000000000009',
          validatedAt:
            '2026-07-19T09:05:00.000Z',
          validatedBy:
            '64b000000000000000000010',
          validatorStaffId:
            '64b000000000000000000011',
          verifiedAt:
            '2026-07-19T09:10:00.000Z',
          verifiedBy:
            '64b000000000000000000012',
          verifierStaffId:
            '64b000000000000000000013',
          correctionReason: null,
          recordedAt:
            '2026-07-19T09:10:00.000Z',
        };

        const report =
          await renderer.renderVerifiedSnapshots({
            orderNumber:
              'LAB-2026-0000001',
            snapshots: [
              snapshot,
            ],
            printedAt:
              new Date(
                '2026-07-19T10:00:00.000Z',
              ),
          });

        expect(report.mediaType).toBe(
          'application/pdf',
        );

        expect(report.filename).toBe(
          'laboratory-lab-2026-0000001.pdf',
        );

        expect(
          Buffer.from(report.bytes)
            .subarray(0, 8)
            .toString('ascii'),
        ).toBe(
          '%PDF-1.4',
        );

        expect(report.contentHash).toMatch(
          /^[a-f\d]{64}$/u,
        );
      },
    );

    it(
      'refuses unknown compensation types instead of silently ignoring recovery work',
      async () => {
        const crypto = {
          protect: vi.fn(),
          unprotect: vi.fn(),
          hash: vi.fn(),
          matchesHash: vi.fn(),
          needsRotation: vi.fn(),
        };

        const executor =
          new LaboratoryCompensationExecutor(
            crypto as never,
          );

        await expect(
          executor.execute({
            key: 'unknown',
            type:
              'laboratory.unsupported',
            payload: {},
          }),
        ).rejects.toThrow(
          'Unsupported Laboratory compensation type',
        );
      },
    );
  },
);
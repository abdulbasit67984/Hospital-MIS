import {
  createHash,
} from 'node:crypto';

import type {
  LaboratoryReportDocument,
} from '../laboratory.ports.js';

import type {
  LaboratoryVerifiedResultSnapshot,
} from '../laboratory-result.workflow-helpers.js';

function pdfEscape(
  value:
    string,
): string {
  return value
    .replaceAll(
      '\\',
      '\\\\',
    )
    .replaceAll(
      '(',
      '\\(',
    )
    .replaceAll(
      ')',
      '\\)',
    )
    .replaceAll(
      /[^\x20-\x7E]/gu,
      ' ',
    );
}

function wrapLine(
  value:
    string,

  width =
    92,
): string[] {
  const words =
    value
      .trim()
      .split(
        /\s+/u,
      );

  const lines:
    string[] =
      [];

  let current =
    '';

  for (
    const word of
    words
  ) {
    const candidate =
      current.length ===
        0
        ? word
        : `${current} ${word}`;

    if (
      candidate.length <=
      width
    ) {
      current =
        candidate;

      continue;
    }

    if (
      current.length >
      0
    ) {
      lines.push(
        current,
      );
    }

    current =
      word;
  }

  if (
    current.length >
    0
  ) {
    lines.push(
      current,
    );
  }

  return lines.length ===
    0
    ? ['']
    : lines;
}

function resultValue(
  component:
    LaboratoryVerifiedResultSnapshot[
      'components'
    ][number],
): string {
  if (
    component.numericValue !==
    null
  ) {
    return [
      component.numericValue,

      component.unitName ??
      component.unitCode ??
      '',
    ]
      .filter(
        (part) =>
          part.length >
          0,
      )
      .join(' ');
  }

  if (
    component.textValue !==
    null
  ) {
    return component
      .textValue;
  }

  if (
    component.codedValue !==
    null
  ) {
    return component
      .codedValue
      .display;
  }

  if (
    component.qualitativeValue !==
    null
  ) {
    return component
      .qualitativeValue;
  }

  if (
    component.structuredValue !==
    null
  ) {
    return JSON.stringify(
      component
        .structuredValue,
    );
  }

  return '';
}

function reportLines(
  snapshots:
    readonly LaboratoryVerifiedResultSnapshot[],

  printedAt:
    Date,
): string[] {
  const lines: string[] = [
    'HOSPITAL MANAGEMENT INFORMATION SYSTEM',
    'LABORATORY RESULT REPORT',
    '',
    `Printed at: ${printedAt.toISOString()}`,
    '',
  ];

  for (
    const snapshot of
    snapshots
  ) {
    lines.push(
      `Result: ${snapshot.resultNumber}`,

      `Test: ${snapshot.testName} (${snapshot.testCode})`,

      `Patient ID: ${snapshot.patientId}`,

      `Encounter ID: ${snapshot.encounterId}`,

      `Order ID: ${snapshot.labOrderId}`,

      `Status: ${snapshot.status}`,

      `Verified at: ${snapshot.verifiedAt}`,

      `Overall flag: ${snapshot.overallFlag}`,

      '',

      'Component | Result | Reference | Flag',

      '------------------------------------------------------------',
    );

    for (
      const component of
      snapshot.components
    ) {
      const value =
        resultValue(
          component,
        );

      const reference =
        component
          .referenceRange
          ?.displayText ??
        'Not specified';

      lines.push(
        ...wrapLine(
          `${component.componentName} | ${value} | ${reference} | ${component.flag}`,
        ),
      );

      if (
        component.interpretation !==
        null
      ) {
        lines.push(
          ...wrapLine(
            `Interpretation: ${component.interpretation}`,
          ),
        );
      }
    }

    if (
      snapshot.conclusion !==
      null
    ) {
      lines.push(
        '',

        ...wrapLine(
          `Conclusion: ${snapshot.conclusion}`,
        ),
      );
    }

    lines.push(
      '',

      `Technician staff ID: ${snapshot.technicianStaffId}`,

      `Validator staff ID: ${snapshot.validatorStaffId}`,

      `Verifier staff ID: ${snapshot.verifierStaffId}`,

      `Immutable version: ${snapshot.versionNumber}`,

      '',

      '============================================================',

      '',
    );
  }

  return lines;
}

function buildPdf(
  lines:
    readonly string[],
): Uint8Array {
  const pageHeight =
    792;

  const left =
    44;

  const top =
    748;

  const lineHeight =
    12;

  const maxLines =
    55;

  const pages:
    string[][] =
      [];

  for (
    let index =
      0;

    index <
    lines.length;

    index +=
      maxLines
  ) {
    pages.push(
      lines.slice(
        index,
        index +
          maxLines,
      ),
    );
  }

  if (
    pages.length ===
    0
  ) {
    pages.push(
      [''],
    );
  }

  const objects:
    string[] =
      [];

  const pageObjectNumbers:
    number[] =
      [];

  objects.push(
    '<< /Type /Catalog /Pages 2 0 R >>',
  );

  objects.push(
    '',
  );

  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  );

  for (
    const page of
    pages
  ) {
    const pageObjectNumber =
      objects.length +
      1;

    const contentObjectNumber =
      pageObjectNumber +
      1;

    pageObjectNumbers.push(
      pageObjectNumber,
    );

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
    );

    const commands = [
      'BT',

      '/F1 9 Tf',

      `${left} ${top} Td`,

      `${lineHeight} TL`,

      ...page.flatMap(
        (
          line,
          index,
        ) => [
          ...(
            index ===
              0
              ? []
              : [
                  'T*',
                ]
          ),

          `(${pdfEscape(line)}) Tj`,
        ],
      ),

      'ET',
    ].join('\n');

    objects.push(
      `<< /Length ${Buffer.byteLength(commands, 'utf8')} >>\nstream\n${commands}\nendstream`,
    );
  }

  objects[
    1
  ] =
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>`;

  let output =
    '%PDF-1.4\n';

  const offsets:
    number[] = [
      0,
    ];

  for (
    let index =
      0;

    index <
    objects.length;

    index +=
      1
  ) {
    offsets.push(
      Buffer.byteLength(
        output,
        'utf8',
      ),
    );

    output +=
      `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset =
    Buffer.byteLength(
      output,
      'utf8',
    );

  output +=
    `xref\n0 ${objects.length + 1}\n`;

  output +=
    '0000000000 65535 f \n';

  for (
    const offset of
    offsets.slice(
      1,
    )
  ) {
    output +=
      `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  output += [
    'trailer',

    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,

    'startxref',

    String(
      xrefOffset,
    ),

    '%%EOF',
  ].join('\n');

  return new Uint8Array(
    Buffer.from(
      output,
      'utf8',
    ),
  );
}

export class LaboratoryReportRenderer {
  public async renderVerifiedSnapshots(
    input: {
      orderNumber:
        string;

      snapshots:
        readonly LaboratoryVerifiedResultSnapshot[];

      printedAt:
        Date;
    },
  ): Promise<
    LaboratoryReportDocument
  > {
    const bytes =
      buildPdf(
        reportLines(
          input.snapshots,
          input.printedAt,
        ),
      );

    return {
      mediaType:
        'application/pdf',

      filename:
        `laboratory-${input.orderNumber.toLowerCase()}.pdf`,

      bytes,

      contentHash:
        createHash(
          'sha256',
        )
          .update(
            bytes,
          )
          .digest(
            'hex',
          ),
    };
  }
}
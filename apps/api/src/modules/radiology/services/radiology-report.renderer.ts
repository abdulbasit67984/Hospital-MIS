import {
  createHash,
} from 'node:crypto';

import type {
  RadiologyFinalReportSnapshot,
  RadiologyReportDocument,
  RadiologyReportRendererPort,
} from '../radiology-reporting.contracts.js';

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

function section(
  lines:
    string[],

  title:
    string,

  value:
    | string
    | null,
): void {
  if (
    value ===
    null
  ) {
    return;
  }

  lines.push(
    '',
    title.toUpperCase(),
    ...wrapLine(
      value,
    ),
  );
}

function reportLines(
  snapshot:
    RadiologyFinalReportSnapshot,

  printedAt:
    Date,
): string[] {
  const lines = [
    'HOSPITAL MANAGEMENT INFORMATION SYSTEM',
    'RADIOLOGY REPORT',
    '',
    `Report number: ${snapshot.reportNumber}`,
    `Procedure: ${snapshot.procedureName} (${snapshot.procedureCode})`,
    `Modality: ${snapshot.modalityCode}`,
    `Accession: ${snapshot.accessionNumber}`,
    `Patient ID: ${snapshot.patientId}`,
    `Encounter ID: ${snapshot.encounterId}`,
    `Order ID: ${snapshot.orderId}`,
    `Study Instance UID: ${snapshot.studyInstanceUid}`,
    `Status: ${snapshot.status}`,
    `Urgency: ${snapshot.urgency}`,
    `Immutable version: ${snapshot.versionNumber}`,
    `Finalized at: ${snapshot.finalizedAt}`,
    `Printed at: ${printedAt.toISOString()}`,
  ];

  section(
    lines,
    'Clinical history',
    snapshot.clinicalHistory,
  );

  if (
    snapshot
      .comparisonStudyReferences
      .length >
    0
  ) {
    section(
      lines,
      'Comparison studies',
      snapshot
        .comparisonStudyReferences
        .join('; '),
    );
  }

  section(
    lines,
    'Findings',
    snapshot.findings,
  );

  section(
    lines,
    'Impression',
    snapshot.impression,
  );

  section(
    lines,
    'Recommendations',
    snapshot.recommendations,
  );

  if (
    snapshot
      .criticalFindings
      .length >
    0
  ) {
    lines.push(
      '',
      'CRITICAL OR URGENT FINDINGS',
    );

    for (
      const finding of
      snapshot.criticalFindings
    ) {
      lines.push(
        ...wrapLine(
          `${finding.findingCode} | ${finding.urgency} | ${finding.title}: ${finding.description}`,
        ),
      );

      if (
        finding.recommendation !==
        null
      ) {
        lines.push(
          ...wrapLine(
            `Recommendation: ${finding.recommendation}`,
          ),
        );
      }
    }
  }

  if (
    snapshot.correctionReason !==
    null
  ) {
    section(
      lines,
      'Correction reason',
      snapshot.correctionReason,
    );
  }

  if (
    snapshot.addendumText !==
    null
  ) {
    section(
      lines,
      'Addendum',
      snapshot.addendumText,
    );
  }

  lines.push(
    '',
    `Author staff ID: ${snapshot.authorStaffId}`,
    `Final radiologist staff ID: ${snapshot.finalRadiologistStaffId}`,
    `Attachment references: ${snapshot.attachmentIds.length}`,
    '',
    'This report was rendered from an immutable encrypted report-version snapshot.',
  );

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
    string[] = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];

  const pageObjectNumbers:
    number[] =
      [];

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

  const offsets = [
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

export class RadiologyReportRenderer
  implements RadiologyReportRendererPort {
  public async renderFinalSnapshot(
    input: {
      snapshot:
        RadiologyFinalReportSnapshot;

      printedAt:
        Date;
    },
  ): Promise<
    RadiologyReportDocument
  > {
    const bytes =
      buildPdf(
        reportLines(
          input.snapshot,
          input.printedAt,
        ),
      );

    return {
      mediaType:
        'application/pdf',

      filename:
        `radiology-${input.snapshot.reportNumber.toLowerCase()}.pdf`,

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
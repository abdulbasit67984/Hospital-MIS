import {
  createHash,
} from 'node:crypto';

import type {
  Db,
} from '@hospital-mis/database';

import type {
  PrescriptionPrintDocument,
  PrescriptionPrintPort,
} from '../modules/formulary-prescriptions/formulary-prescriptions.ports.js';

interface FacilityPrintRecord {
  code:
    string;

  name:
    string;

  address?: {
    line1?:
      string | null;

    line2?:
      string | null;

    city?:
      string | null;

    district?:
      string | null;

    province?:
      string | null;

    postalCode?:
      string | null;

    countryCode?:
      string | null;
  };

  contact?: {
    primaryPhone?:
      string | null;

    email?:
      string | null;
  };
}

interface PatientPrintRecord {
  displayName:
    string;

  enterprisePatientId:
    string;
}

interface ProviderPrintRecord {
  displayName:
    string;

  designation?:
    string | null;

  professionalType?:
    string | null;

  professionalRegistrationNumber?:
    string | null;
}

interface PdfPage {
  lines:
    string[];
}

const pageWidth =
  595;

const pageHeight =
  842;

const leftMargin =
  48;

const topMargin =
  52;

const bottomMargin =
  48;

const fontSize =
  10;

const lineHeight =
  14;

const maximumCharactersPerLine =
  88;

function printableText(
  value:
    unknown,
): string {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return '';
  }

  return String(
    value,
  )
    .normalize(
      'NFKC',
    )
    .replaceAll(
      /[^\x20-\x7E]/gu,
      '?',
    )
    .replaceAll(
      /\s+/gu,
      ' ',
    )
    .trim();
}

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
    );
}

function wrapText(
  value:
    string,

  width =
    maximumCharactersPerLine,
): string[] {
  const normalized =
    printableText(
      value,
    );

  if (
    normalized.length ===
    0
  ) {
    return [
      '',
    ];
  }

  const words =
    normalized.split(
      ' ',
    );

  const lines:
    string[] = [];

  let current =
    '';

  for (
    const word of
    words
  ) {
    if (
      word.length >
      width
    ) {
      if (
        current.length >
        0
      ) {
        lines.push(
          current,
        );

        current =
          '';
      }

      for (
        let index =
          0;

        index <
        word.length;

        index +=
        width
      ) {
        lines.push(
          word.slice(
            index,
            index + width,
          ),
        );
      }

      continue;
    }

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
    } else {
      lines.push(
        current,
      );

      current =
        word;
    }
  }

  if (
    current.length >
    0
  ) {
    lines.push(
      current,
    );
  }

  return lines;
}

function formattedDateTime(
  value:
    Date | null,

  locale:
    string,

  timezone:
    string,
): string {
  if (
    value ===
    null
  ) {
    return '-';
  }

  try {
    return new Intl.DateTimeFormat(
      locale,
      {
        dateStyle:
          'medium',

        timeStyle:
          'short',

        timeZone:
          timezone,
      },
    ).format(
      value,
    );
  } catch {
    return value.toISOString();
  }
}

function facilityAddress(
  facility:
    FacilityPrintRecord | null,
): string {
  if (
    facility ===
    null
  ) {
    return '';
  }

  return [
    facility.address?.line1,
    facility.address?.line2,
    facility.address?.city,
    facility.address?.district,
    facility.address?.province,
    facility.address?.postalCode,
    facility.address?.countryCode,
  ]
    .filter(
      (
        value,
      ): value is string =>
        typeof value ===
          'string' &&
        value.trim().length >
          0,
    )
    .join(
      ', ',
    );
}

function addWrappedLine(
  lines:
    string[],

  value:
    string,

  indent =
    '',
): void {
  for (
    const wrapped of
    wrapText(
      value,
      maximumCharactersPerLine -
      indent.length,
    )
  ) {
    lines.push(
      `${indent}${wrapped}`,
    );
  }
}

function buildPages(
  lines:
    readonly string[],
): PdfPage[] {
  const maximumLines =
    Math.floor(
      (
        pageHeight -
        topMargin -
        bottomMargin
      ) /
      lineHeight,
    );

  const pages:
    PdfPage[] = [];

  for (
    let index =
      0;

    index <
    lines.length;

    index +=
    maximumLines
  ) {
    pages.push({
      lines:
        lines.slice(
          index,
          index +
          maximumLines,
        ),
    });
  }

  return pages.length ===
  0
    ? [
        {
          lines: [
            '',
          ],
        },
      ]
    : pages;
}

function pageStream(
  page:
    PdfPage,

  pageNumber:
    number,

  totalPages:
    number,
): string {
  const commands:
    string[] = [
      'BT',
      `/F1 ${fontSize} Tf`,
      `${lineHeight} TL`,
      `${leftMargin} ${pageHeight - topMargin} Td`,
  ];

  page.lines.forEach(
    (
      line,
      index,
    ) => {
      if (
        index >
        0
      ) {
        commands.push(
          'T*',
        );
      }

      commands.push(
        `(${pdfEscape(line)}) Tj`,
      );
    },
  );

  commands.push(
    'ET',
  );

  commands.push(
    'BT',
    '/F1 8 Tf',
    `${pageWidth - 110} 24 Td`,
    `(Page ${pageNumber} of ${totalPages}) Tj`,
    'ET',
  );

  return commands.join(
    '\n',
  );
}

function buildPdf(
  pages:
    readonly PdfPage[],
): Uint8Array {
  const objects:
    string[] = [];

  const pageObjectNumbers =
    pages.map(
      (
        _page,
        index,
      ) =>
        4 +
        index *
        2,
    );

  const contentObjectNumbers =
    pages.map(
      (
        _page,
        index,
      ) =>
        5 +
        index *
        2,
    );

  objects[
    1
  ] =
    '<< /Type /Catalog /Pages 2 0 R >>';

  objects[
    2
  ] =
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  objects[
    3
  ] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  pages.forEach(
    (
      page,
      index,
    ) => {
      const pageObjectNumber =
        pageObjectNumbers[
          index
        ];

      const contentObjectNumber =
        contentObjectNumbers[
          index
        ];

      const stream =
        pageStream(
          page,
          index + 1,
          pages.length,
        );

      objects[
        pageObjectNumber
      ] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;

      objects[
        contentObjectNumber
      ] =
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
    },
  );

  let document =
    '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';

  const offsets:
    number[] = [
      0,
    ];

  for (
    let objectNumber =
      1;

    objectNumber <
    objects.length;

    objectNumber +=
    1
  ) {
    const object =
      objects[
        objectNumber
      ];

    if (
      object ===
      undefined
    ) {
      continue;
    }

    offsets[
      objectNumber
    ] =
      Buffer.byteLength(
        document,
        'latin1',
      );

    document +=
      `${objectNumber} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset =
    Buffer.byteLength(
      document,
      'latin1',
    );

  document +=
    `xref\n0 ${objects.length}\n`;

  document +=
    '0000000000 65535 f \n';

  for (
    let objectNumber =
      1;

    objectNumber <
    objects.length;

    objectNumber +=
    1
  ) {
    const offset =
      offsets[
        objectNumber
      ] ??
      0;

    document +=
      `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  document +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Uint8Array(
    Buffer.from(
      document,
      'latin1',
    ),
  );
}

export class PrescriptionPdfPrintAdapter
implements PrescriptionPrintPort {
  public constructor(
    private readonly database:
      Db,
  ) {}

  public async render(
    input:
      Parameters<PrescriptionPrintPort['render']>[0],
  ): Promise<PrescriptionPrintDocument> {
    const [
      facility,
      patient,
      provider,
    ] =
      await Promise.all([
        this.database
          .collection<FacilityPrintRecord>(
            'facilities',
          )
          .findOne({
            _id:
              input.prescription.facilityId,
          }),

        this.database
          .collection<PatientPrintRecord>(
            'patients',
          )
          .findOne({
            _id:
              input.prescription.patientId,

            facilityId:
              input.prescription.facilityId,
          }),

        this.database
          .collection<ProviderPrintRecord>(
            'staff',
          )
          .findOne({
            _id:
              input.prescription.prescriberProviderId,

            facilityId:
              input.prescription.facilityId,
          }),
      ]);

    const lines:
      string[] = [];

    lines.push(
      printableText(
        facility?.name ??
        'Hospital Management Information System',
      ),
    );

    if (
      facility !==
      null
    ) {
      lines.push(
        `Facility Code: ${printableText(facility.code)}`,
      );

      const address =
        facilityAddress(
          facility,
        );

      if (
        address.length >
        0
      ) {
        addWrappedLine(
          lines,
          address,
        );
      }

      const contacts =
        [
          facility.contact?.primaryPhone,
          facility.contact?.email,
        ]
          .filter(
            (
              value,
            ): value is string =>
              typeof value ===
                'string' &&
              value.trim().length >
                0,
          )
          .join(
            ' | ',
          );

      if (
        contacts.length >
        0
      ) {
        lines.push(
          printableText(
            contacts,
          ),
        );
      }
    }

    lines.push(
      '',
      'PRESCRIPTION',
      '------------------------------------------------------------',
      `Prescription Number: ${printableText(input.prescription.prescriptionNumber)}`,
      `Status: ${printableText(input.prescription.status)}`,
      `Revision: ${input.prescription.revisionNumber}`,
      `Issued At: ${formattedDateTime(input.prescription.issuedAt, input.locale, input.timezone)}`,
      `Expires At: ${formattedDateTime(input.prescription.expiresAt, input.locale, input.timezone)}`,
      '',
      `Patient: ${printableText(patient?.displayName ?? input.prescription.patientId.toHexString())}`,
      `Patient Reference: ${printableText(patient?.enterprisePatientId ?? input.prescription.patientId.toHexString())}`,
      `Encounter Reference: ${input.prescription.encounterId.toHexString()}`,
      '',
      `Prescriber: ${printableText(provider?.displayName ?? input.prescription.prescriberProviderId.toHexString())}`,
    );

    const providerDetails =
      [
        provider?.designation,
        provider?.professionalType,
      ]
        .filter(
          (
            value,
          ): value is string =>
            typeof value ===
              'string' &&
            value.trim().length >
              0,
        )
        .join(
          ' | ',
        );

    if (
      providerDetails.length >
      0
    ) {
      lines.push(
        printableText(
          providerDetails,
        ),
      );
    }

    if (
      provider?.professionalRegistrationNumber
    ) {
      lines.push(
        `Professional Registration: ${printableText(provider.professionalRegistrationNumber)}`,
      );
    }

    lines.push(
      '',
      'MEDICINES',
      '------------------------------------------------------------',
    );

    for (
      const item of
      input.items
    ) {
      const medicineName =
        [
          item.genericNameSnapshot,
          item.selectedBrandName,
          item.medicineFormSnapshot,
          item.medicineStrengthSnapshot,
        ]
          .filter(
            (
              value,
            ): value is string =>
              typeof value ===
                'string' &&
              value.trim().length >
                0,
          )
          .join(
            ' | ',
          );

      addWrappedLine(
        lines,
        `${item.sequence}. ${medicineName}`,
      );

      addWrappedLine(
        lines,
        `Dose: ${item.dose.toString()} ${item.doseUnitSnapshot}; Route: ${item.routeSnapshot}; Frequency: ${item.frequencySnapshot}`,
        '   ',
      );

      const duration =
        item.durationValue ===
        null
          ? item.durationUnit
          : `${item.durationValue.toString()} ${item.durationUnit}`;

      addWrappedLine(
        lines,
        `Duration: ${duration}; Quantity: ${item.quantity.toString()} ${item.quantityUnitSnapshot}`,
        '   ',
      );

      if (
        item.instructions !==
        null
      ) {
        addWrappedLine(
          lines,
          `Instructions: ${item.instructions}`,
          '   ',
        );
      }

      if (
        item.asNeeded
      ) {
        addWrappedLine(
          lines,
          `As needed${item.asNeededReason === null ? '' : `: ${item.asNeededReason}`}`,
          '   ',
        );
      }

      lines.push(
        '',
      );
    }

    lines.push(
      'SAFETY REVIEW',
      '------------------------------------------------------------',
      `Recorded Safety Warnings: ${input.warnings.length}`,
      `Unresolved Blocking Warnings: ${input.prescription.unresolvedBlockingWarningCount}`,
      '',
      'This prescription records the provider order only.',
      'Inventory is adjusted exclusively through the Pharmacy Dispensing module.',
      '',
      `Printed At: ${formattedDateTime(new Date(), input.locale, input.timezone)}`,
      `Print Revision: ${input.prescription.printRevision + 1}`,
      '',
      'Provider Signature: ______________________________',
    );

    const pages =
      buildPages(
        lines,
      );

    const bytes =
      buildPdf(
        pages,
      );

    const contentHash =
      createHash(
        'sha256',
      )
        .update(
          bytes,
        )
        .digest(
          'hex',
        );

    const safePrescriptionNumber =
      input.prescription
        .prescriptionNumber
        .replaceAll(
          /[^A-Za-z0-9._-]+/gu,
          '-',
        )
        .slice(
          0,
          100,
        );

    return {
      mediaType:
        'application/pdf',

      filename:
        `${safePrescriptionNumber || 'prescription'}.pdf`,

      contentHash,

      bytes,
    };
  }
}
import {
  DateTime,
} from 'luxon';

import {
  BadRequestError,
} from './errors.js';

export const hospitalTimezone =
  'Asia/Karachi' as const;

export type UtcRange =
  Readonly<{
    startInclusive: Date;
    endExclusive: Date;
  }>;

function requireValidDateTime(
  value: DateTime,
  field: string,
): DateTime {
  if (!value.isValid) {
    throw new BadRequestError(
      `Invalid ${field}`,
      [
        {
          code:
            'invalid_datetime',

          message:
            value.invalidExplanation ??
            `Invalid ${field}`,

          path:
            field,
        },
      ],
    );
  }

  return value;
}

export function parseUtcDateTime(
  value: string,
  field = 'datetime',
): Date {
  const parsed =
    requireValidDateTime(
      DateTime.fromISO(
        value,
        {
          setZone: true,
        },
      ),
      field,
    );

  if (
    parsed.offset !== 0
  ) {
    return parsed
      .toUTC()
      .toJSDate();
  }

  return parsed.toJSDate();
}

export function localDateTimeToUtc(
  localDateTime: string,
  timezone:
    string =
      hospitalTimezone,
  field = 'datetime',
): Date {
  const parsed =
    requireValidDateTime(
      DateTime.fromISO(
        localDateTime,
        {
          zone: timezone,
          setZone: false,
        },
      ),
      field,
    );

  return parsed
    .toUTC()
    .toJSDate();
}

export function toHospitalDateTime(
  value: Date,
  timezone:
    string =
      hospitalTimezone,
): string {
  const result =
    DateTime.fromJSDate(
      value,
      {
        zone: 'utc',
      },
    )
      .setZone(timezone)
      .toISO({
        suppressMilliseconds:
          false,
      });

  if (result === null) {
    throw new Error(
      'Unable to format hospital datetime',
    );
  }

  return result;
}

export function hospitalServiceDate(
  value:
    Date =
      new Date(),
  timezone:
    string =
      hospitalTimezone,
): string {
  const serviceDate =
    DateTime.fromJSDate(
      value,
      {
        zone: 'utc',
      },
    )
      .setZone(timezone)
      .toISODate();

  if (
    serviceDate === null
  ) {
    throw new Error(
      'Unable to calculate service date',
    );
  }

  return serviceDate;
}

export function localDateRangeToUtc(
  startDate: string,
  endDateInclusive: string,
  timezone:
    string =
      hospitalTimezone,
): UtcRange {
  const start =
    requireValidDateTime(
      DateTime.fromISO(
        startDate,
        {
          zone: timezone,
        },
      ).startOf('day'),
      'startDate',
    );

  const end =
    requireValidDateTime(
      DateTime.fromISO(
        endDateInclusive,
        {
          zone: timezone,
        },
      )
        .plus({
          days: 1,
        })
        .startOf('day'),
      'endDate',
    );

  if (
    end <= start
  ) {
    throw new BadRequestError(
      'End date must not be earlier than start date',
    );
  }

  return {
    startInclusive:
      start
        .toUTC()
        .toJSDate(),

    endExclusive:
      end
        .toUTC()
        .toJSDate(),
  };
}

export function addCalendarDays(
  value: Date,
  days: number,
  timezone:
    string =
      hospitalTimezone,
): Date {
  return DateTime.fromJSDate(
    value,
    {
      zone: 'utc',
    },
  )
    .setZone(timezone)
    .plus({
      days,
    })
    .toUTC()
    .toJSDate();
}

export function elapsedMinutes(
  start: Date,
  end: Date,
): number {
  return Math.max(
    0,
    Math.floor(
      (
        end.getTime() -
        start.getTime()
      ) /
        60_000,
    ),
  );
}
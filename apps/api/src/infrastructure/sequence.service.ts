import type {
  Db,
} from '@hospital-mis/database';

import {
  createObjectId,
  toObjectId,
} from '@hospital-mis/database';

import {
  ConflictError,
} from '@hospital-mis/shared';

export type SequenceAllocation = {
  key: string;
  value: number;
};

type SequenceDocument = {
  facilityId: ReturnType<
    typeof toObjectId
  >;

  key: string;
  currentValue: number;
  version: number;
};

function isDuplicateKey(
  error: unknown,
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

export class SequenceService {
  constructor(
    private readonly database: Db,
  ) {}

  async next(
    facilityIdValue: string,
    key: string,
  ): Promise<SequenceAllocation> {
    const facilityId =
      toObjectId(
        facilityIdValue,
        'facilityId',
      );

    for (
      let attempt = 0;
      attempt < 2;
      attempt += 1
    ) {
      try {
        const now =
          new Date();

        const result =
          await this.database
            .collection<SequenceDocument>(
              'numberSequences',
            )
            .findOneAndUpdate(
              {
                facilityId,
                key,
              },

              {
                $setOnInsert: {
                  _id:
                    createObjectId(),

                  facilityId,

                  key,

                  currentValue:
                    0,

                  schemaVersion:
                    1,

                  version:
                    0,

                  createdAt:
                    now,
                },

                $inc: {
                  currentValue:
                    1,

                  version:
                    1,
                },

                $set: {
                  updatedAt:
                    now,
                },
              },

              {
                upsert:
                  true,

                returnDocument:
                  'after',
              },
            );

        if (
          result === null
        ) {
          throw new ConflictError(
            `Sequence ${key} could not be allocated`,
          );
        }

        return {
          key,
          value:
            result.currentValue,
        };
      } catch (error) {
        if (
          attempt === 0 &&
          isDuplicateKey(error)
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictError(
      `Sequence ${key} could not be allocated`,
    );
  }

  async formatted(
    input: Readonly<{
      facilityId: string;
      key: string;
      prefix: string;
      width?: number;
      year?: number;
    }>,
  ): Promise<string> {
    const allocated =
      await this.next(
        input.facilityId,
        input.key,
      );

    const width =
      input.width ??
      6;

    const sequence =
      String(
        allocated.value,
      ).padStart(
        width,
        '0',
      );

    const parts = [
      input.prefix,
    ];

    if (
      input.year !==
      undefined
    ) {
      parts.push(
        String(
          input.year,
        ),
      );
    }

    parts.push(sequence);

    return parts.join('-');
  }
}
import {
  Types,
} from 'mongoose';

import {
  RequestValidationError,
} from '@hospital-mis/shared';

export type DatabaseObjectId =
  Types.ObjectId;

export function isValidObjectId(
  value: string,
): boolean {
  return Types.ObjectId.isValid(
    value,
  );
}

export function toObjectId(
  value: string,
  path = 'identifier',
): DatabaseObjectId {
  if (
    !isValidObjectId(
      value,
    )
  ) {
    throw new RequestValidationError([
      {
        code:
          'invalid_identifier',

        message:
          'Invalid identifier value',

        path,
      },
    ]);
  }

  return new Types.ObjectId(
    value,
  );
}

export function createObjectId():
  DatabaseObjectId {
  return new Types.ObjectId();
}
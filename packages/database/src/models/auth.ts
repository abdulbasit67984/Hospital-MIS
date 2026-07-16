import mongoose from 'mongoose';

import {
  baseSchema,
  objectId,
} from './common.js';

import {
  UserModel,
  identityUserStatusValues,
  userSchema,
} from './user.model.js';

export const userStatuses =
  identityUserStatusValues;

export const sessionStatuses = [
  'ACTIVE',
  'REVOKED',
  'COMPROMISED',
  'EXPIRED',
] as const;

export const refreshTokenStatuses = [
  'ACTIVE',
  'ROTATED',
  'REVOKED',
  'REUSED',
  'EXPIRED',
] as const;

const sessionSchema = baseSchema(
  {
    sessionId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    familyId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
    },

    userId: {
      type: objectId,
      required: true,
      immutable: true,
    },

    status: {
      type: String,
      enum: sessionStatuses,
      required: true,
      default: 'ACTIVE',
    },

    userAgent: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    ipAddressHash: {
      type: String,
      trim: true,
      maxlength: 128,
    },

    lastSeenAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revokedAt: {
      type: Date,
    },

    revokedBy: {
      type: objectId,
    },

    revokeReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    compromisedAt: {
      type: Date,
    },

    purgeAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection:
      'sessions',
  },
);

sessionSchema.index(
  {
    sessionId: 1,
  },
  {
    unique: true,
  },
);

sessionSchema.index(
  {
    familyId: 1,
  },
  {
    unique: true,
  },
);

sessionSchema.index({
  facilityId: 1,
  userId: 1,
  status: 1,
  expiresAt: 1,
});

sessionSchema.index({
  status: 1,
  expiresAt: 1,
});

sessionSchema.index(
  {
    purgeAt: 1,
  },
  {
    expireAfterSeconds: 0,
  },
);

const refreshTokenSchema =
  baseSchema(
    {
      tokenId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
      },

      tokenHash: {
        type: String,
        required: true,
        immutable: true,
        select: false,
      },

      sessionId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
      },

      familyId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
      },

      userId: {
        type: objectId,
        required: true,
        immutable: true,
      },

      status: {
        type: String,
        enum:
          refreshTokenStatuses,

        required:
          true,

        default:
          'ACTIVE',
      },

      issuedAt: {
        type: Date,
        required: true,
        default: Date.now,
        immutable: true,
      },

      expiresAt: {
        type: Date,
        required: true,
        immutable: true,
      },

      rotatedAt: {
        type: Date,
      },

      replacedByTokenId: {
        type: String,
        trim: true,
      },

      revokedAt: {
        type: Date,
      },

      revokedBy: {
        type: objectId,
      },

      revokeReason: {
        type: String,
        trim: true,
        maxlength: 500,
      },

      reuseDetectedAt: {
        type: Date,
      },

      purgeAt: {
        type: Date,
        required: true,
      },
    },
    {
      collection:
        'refreshTokens',
    },
  );

refreshTokenSchema.index(
  {
    tokenId: 1,
  },
  {
    unique: true,
  },
);

refreshTokenSchema.index(
  {
    tokenHash: 1,
  },
  {
    unique: true,
  },
);

refreshTokenSchema.index({
  facilityId: 1,
  sessionId: 1,
  status: 1,
  issuedAt: -1,
});

refreshTokenSchema.index({
  facilityId: 1,
  familyId: 1,
  status: 1,
});

refreshTokenSchema.index({
  facilityId: 1,
  userId: 1,
  status: 1,
  expiresAt: 1,
});

refreshTokenSchema.index(
  {
    purgeAt: 1,
  },
  {
    expireAfterSeconds: 0,
  },
);

export const authSchemas = {
  users:
    userSchema,

  sessions:
    sessionSchema,

  refreshTokens:
    refreshTokenSchema,
} as const;

export type AuthModelName =
  keyof typeof authSchemas;

export function registerAuthModels(
  connection:
    mongoose.Connection =
      mongoose.connection,
) {
  if (
    connection ===
    mongoose.connection
  ) {
    void UserModel;
  }

  return Object.fromEntries(
    Object.entries(
      authSchemas,
    ).map(
      ([
        name,
        schema,
      ]) => [
        name,

        connection.models[
          name
        ] ??
          connection.model(
            name,
            schema,
            name,
          ),
      ],
    ),
  );
}
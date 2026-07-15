import type {
    Db,
} from '@hospital-mis/database';

import {
    createObjectId,
    toObjectId,
    type DatabaseObjectId,
} from '@hospital-mis/database';

import type {
    RefreshTokenStatus,
    SessionStatus,
    UserStatus,
} from './auth.types.js';

export type UserRecord = {
    _id: DatabaseObjectId;
    facilityId: DatabaseObjectId;

    publicId: string;
    username: string;
    normalizedUsername: string;

    email?: string;
    normalizedEmail?: string;

    displayName: string;
    passwordHash: string;

    status: UserStatus;
    failedLoginCount: number;
    lockedUntil?: Date;

    passwordChangedAt: Date;
    lastLoginAt?: Date;

    tokenVersion: number;
    permissionVersion: number;

    version: number;
    schemaVersion: number;
    createdAt: Date;
    updatedAt: Date;
};

export type SessionRecord = {
    _id: DatabaseObjectId;
    facilityId: DatabaseObjectId;

    sessionId: string;
    familyId: string;
    userId: DatabaseObjectId;

    status: SessionStatus;

    userAgent?: string;
    ipAddressHash?: string;

    lastSeenAt: Date;
    expiresAt: Date;

    revokedAt?: Date;
    revokeReason?: string;
    compromisedAt?: Date;

    purgeAt: Date;

    version: number;
    schemaVersion: number;
    createdAt: Date;
    updatedAt: Date;
};

export type RefreshTokenRecord = {
    _id: DatabaseObjectId;
    facilityId: DatabaseObjectId;

    tokenId: string;
    tokenHash: string;

    sessionId: string;
    familyId: string;
    userId: DatabaseObjectId;

    status: RefreshTokenStatus;

    issuedAt: Date;
    expiresAt: Date;

    rotatedAt?: Date;
    replacedByTokenId?: string;

    revokedAt?: Date;
    revokeReason?: string;

    reuseDetectedAt?: Date;
    purgeAt: Date;

    version: number;
    schemaVersion: number;
    createdAt: Date;
    updatedAt: Date;
};

export type CreateSessionInput = {
    facilityId: string;
    sessionId: string;
    familyId: string;
    userId: string;

    userAgent?: string;
    ipAddressHash?: string;

    expiresAt: Date;
    purgeAt: Date;
    now: Date;
};

export type CreateRefreshTokenInput = {
    facilityId: string;
    tokenId: string;
    tokenHash: string;

    sessionId: string;
    familyId: string;
    userId: string;

    issuedAt: Date;
    expiresAt: Date;
    purgeAt: Date;
};

export interface AuthRepository {
    findUserForLogin(
        facilityId: string,
        normalizedLogin: string,
    ): Promise<UserRecord | null>;

    findUserById(
        facilityId: string,
        userId: string,
    ): Promise<UserRecord | null>;

    recordFailedLogin(
        user: UserRecord,
        input: {
            now: Date;
            maxAttempts: number;
            lockedUntil: Date;
        },
    ): Promise<boolean>;

    recordSuccessfulLogin(
        user: UserRecord,
        now: Date,
    ): Promise<boolean>;

    createSession(
        input: CreateSessionInput,
    ): Promise<void>;

    deleteSessionAfterFailedCreation(
        sessionId: string,
    ): Promise<void>;

    insertRefreshToken(
        input: CreateRefreshTokenInput,
    ): Promise<void>;

    deleteActiveRefreshToken(
        tokenId: string,
    ): Promise<void>;

    findRefreshTokenByTokenId(
        tokenId: string,
    ): Promise<RefreshTokenRecord | null>;

    findSessionBySessionId(
        sessionId: string,
    ): Promise<SessionRecord | null>;

    rotateRefreshToken(
        input: {
            tokenId: string;
            tokenHash: string;
            replacementTokenId: string;
            now: Date;
        },
    ): Promise<boolean>;

    touchSession(
        sessionId: string,
        touchedBefore: Date,
        now: Date,
    ): Promise<void>;

    revokeSession(
        input: {
            sessionId: string;
            userId: string;
            now: Date;
            reason: string;
        },
    ): Promise<boolean>;

    revokeAllUserSessions(
        input: {
            facilityId: string;
            userId: string;
            now: Date;
            reason: string;
        },
    ): Promise<number>;

    compromiseTokenFamily(
        input: {
            sessionId: string;
            familyId: string;
            presentedTokenId: string;
            now: Date;
        },
    ): Promise<void>;

    listUserSessions(
        facilityId: string,
        userId: string,
    ): Promise<SessionRecord[]>;
}

export class MongoAuthRepository
    implements AuthRepository {
    constructor(
        private readonly database: Db,
    ) { }

    private get users() {
        return this.database.collection<UserRecord>(
            'users',
        );
    }

    private get sessions() {
        return this.database.collection<SessionRecord>(
            'sessions',
        );
    }

    private get refreshTokens() {
        return this.database.collection<RefreshTokenRecord>(
            'refreshTokens',
        );
    }

    async findUserForLogin(
        facilityId: string,
        normalizedLogin: string,
    ): Promise<UserRecord | null> {
        return this.users.findOne({
            facilityId:
                toObjectId(
                    facilityId,
                    'body.facilityId',
                ),

            $or: [
                {
                    normalizedUsername:
                        normalizedLogin,
                },

                {
                    normalizedEmail:
                        normalizedLogin,
                },
            ],
        });
    }

    async findUserById(
        facilityId: string,
        userId: string,
    ): Promise<UserRecord | null> {
        return this.users.findOne({
            _id:
                toObjectId(
                    userId,
                    'userId',
                ),

            facilityId:
                toObjectId(
                    facilityId,
                    'facilityId',
                ),
        });
    }

    async recordFailedLogin(
        user: UserRecord,
        input: {
            now: Date;
            maxAttempts: number;
            lockedUntil: Date;
        },
    ): Promise<boolean> {
        const failedLoginCount =
            user.failedLoginCount + 1;

        const shouldLock =
            failedLoginCount >=
            input.maxAttempts;

        const result =
            await this.users.updateOne(
                {
                    _id:
                        user._id,

                    version:
                        user.version,
                },

                {
                    $set: {
                        failedLoginCount,

                        ...(shouldLock
                            ? {
                                status:
                                    'LOCKED' as const,

                                lockedUntil:
                                    input.lockedUntil,
                            }
                            : {}),
                    },

                    $inc: {
                        version:
                            1,
                    },

                    $currentDate: {
                        updatedAt:
                            true,
                    },
                },
            );

        return result.modifiedCount === 1;
    }

    async recordSuccessfulLogin(
        user: UserRecord,
        now: Date,
    ): Promise<boolean> {
        const result =
            await this.users.updateOne(
                {
                    _id:
                        user._id,

                    version:
                        user.version,
                },

                {
                    $set: {
                        status:
                            'ACTIVE',

                        failedLoginCount:
                            0,

                        lastLoginAt:
                            now,
                    },

                    $unset: {
                        lockedUntil:
                            '',
                    },

                    $inc: {
                        version:
                            1,
                    },

                    $currentDate: {
                        updatedAt:
                            true,
                    },
                },
            );

        return result.modifiedCount === 1;
    }

    async createSession(
        input: CreateSessionInput,
    ): Promise<void> {
        await this.sessions.insertOne({
            _id:
                createObjectId(),

            facilityId:
                toObjectId(
                    input.facilityId,
                ),

            sessionId:
                input.sessionId,

            familyId:
                input.familyId,

            userId:
                toObjectId(
                    input.userId,
                ),

            status:
                'ACTIVE',

            ...(input.userAgent === undefined
                ? {}
                : {
                    userAgent:
                        input.userAgent,
                }),

            ...(input.ipAddressHash === undefined
                ? {}
                : {
                    ipAddressHash:
                        input.ipAddressHash,
                }),

            lastSeenAt:
                input.now,

            expiresAt:
                input.expiresAt,

            purgeAt:
                input.purgeAt,

            schemaVersion:
                1,

            version:
                0,

            createdAt:
                input.now,

            updatedAt:
                input.now,
        });
    }

    async deleteSessionAfterFailedCreation(
        sessionId: string,
    ): Promise<void> {
        await this.sessions.deleteOne({
            sessionId,
            status:
                'ACTIVE',
        });
    }

    async insertRefreshToken(
        input: CreateRefreshTokenInput,
    ): Promise<void> {
        await this.refreshTokens.insertOne({
            _id:
                createObjectId(),

            facilityId:
                toObjectId(
                    input.facilityId,
                ),

            tokenId:
                input.tokenId,

            tokenHash:
                input.tokenHash,

            sessionId:
                input.sessionId,

            familyId:
                input.familyId,

            userId:
                toObjectId(
                    input.userId,
                ),

            status:
                'ACTIVE',

            issuedAt:
                input.issuedAt,

            expiresAt:
                input.expiresAt,

            purgeAt:
                input.purgeAt,

            schemaVersion:
                1,

            version:
                0,

            createdAt:
                input.issuedAt,

            updatedAt:
                input.issuedAt,
        });
    }

    async deleteActiveRefreshToken(
        tokenId: string,
    ): Promise<void> {
        await this.refreshTokens.deleteOne({
            tokenId,
            status:
                'ACTIVE',
        });
    }

    async findRefreshTokenByTokenId(
        tokenId: string,
    ): Promise<RefreshTokenRecord | null> {
        return this.refreshTokens.findOne({
            tokenId,
        });
    }

    async findSessionBySessionId(
        sessionId: string,
    ): Promise<SessionRecord | null> {
        return this.sessions.findOne({
            sessionId,
        });
    }

    async rotateRefreshToken(
        input: {
            tokenId: string;
            tokenHash: string;
            replacementTokenId: string;
            now: Date;
        },
    ): Promise<boolean> {
        const result =
            await this.refreshTokens.updateOne(
                {
                    tokenId:
                        input.tokenId,

                    tokenHash:
                        input.tokenHash,

                    status:
                        'ACTIVE',

                    expiresAt: {
                        $gt:
                            input.now,
                    },
                },

                {
                    $set: {
                        status:
                            'ROTATED',

                        rotatedAt:
                            input.now,

                        replacedByTokenId:
                            input.replacementTokenId,
                    },

                    $inc: {
                        version:
                            1,
                    },

                    $currentDate: {
                        updatedAt:
                            true,
                    },
                },
            );

        return result.modifiedCount === 1;
    }

    async touchSession(
        sessionId: string,
        touchedBefore: Date,
        now: Date,
    ): Promise<void> {
        await this.sessions.updateOne(
            {
                sessionId,

                status:
                    'ACTIVE',

                lastSeenAt: {
                    $lt:
                        touchedBefore,
                },
            },

            {
                $set: {
                    lastSeenAt:
                        now,
                },

                $inc: {
                    version:
                        1,
                },

                $currentDate: {
                    updatedAt:
                        true,
                },
            },
        );
    }

    async revokeSession(
        input: {
            sessionId: string;
            userId: string;
            now: Date;
            reason: string;
        },
    ): Promise<boolean> {
        const userId =
            toObjectId(
                input.userId,
            );

        const result =
            await this.sessions.updateOne(
                {
                    sessionId:
                        input.sessionId,

                    userId,

                    status:
                        'ACTIVE',
                },

                {
                    $set: {
                        status:
                            'REVOKED',

                        revokedAt:
                            input.now,

                        revokeReason:
                            input.reason,
                    },

                    $inc: {
                        version:
                            1,
                    },

                    $currentDate: {
                        updatedAt:
                            true,
                    },
                },
            );

        await this.refreshTokens.updateMany(
            {
                sessionId:
                    input.sessionId,

                userId,

                status: {
                    $in: [
                        'ACTIVE',
                        'ROTATED',
                    ],
                },
            },

            {
                $set: {
                    status:
                        'REVOKED',

                    revokedAt:
                        input.now,

                    revokeReason:
                        input.reason,
                },

                $inc: {
                    version:
                        1,
                },

                $currentDate: {
                    updatedAt:
                        true,
                },
            },
        );

        return result.modifiedCount === 1;
    }

    async revokeAllUserSessions(
        input: {
            facilityId: string;
            userId: string;
            now: Date;
            reason: string;
        },
    ): Promise<number> {
        const facilityId =
            toObjectId(
                input.facilityId,
            );

        const userId =
            toObjectId(
                input.userId,
            );

        const result =
            await this.sessions.updateMany(
                {
                    facilityId,
                    userId,

                    status:
                        'ACTIVE',
                },

                {
                    $set: {
                        status:
                            'REVOKED',

                        revokedAt:
                            input.now,

                        revokeReason:
                            input.reason,
                    },

                    $inc: {
                        version:
                            1,
                    },

                    $currentDate: {
                        updatedAt:
                            true,
                    },
                },
            );

        await this.refreshTokens.updateMany(
            {
                facilityId,
                userId,

                status: {
                    $in: [
                        'ACTIVE',
                        'ROTATED',
                    ],
                },
            },

            {
                $set: {
                    status:
                        'REVOKED',

                    revokedAt:
                        input.now,

                    revokeReason:
                        input.reason,
                },

                $inc: {
                    version:
                        1,
                },

                $currentDate: {
                    updatedAt:
                        true,
                },
            },
        );

        return result.modifiedCount;
    }

    async compromiseTokenFamily(
        input: {
            sessionId: string;
            familyId: string;
            presentedTokenId: string;
            now: Date;
        },
    ): Promise<void> {
        await this.sessions.updateOne(
            {
                sessionId:
                    input.sessionId,
            },

            {
                $set: {
                    status:
                        'COMPROMISED',

                    compromisedAt:
                        input.now,

                    revokeReason:
                        'Refresh-token reuse detected',
                },

                $inc: {
                    version:
                        1,
                },

                $currentDate: {
                    updatedAt:
                        true,
                },
            },
        );

        await this.refreshTokens.updateOne(
            {
                tokenId:
                    input.presentedTokenId,
            },

            {
                $set: {
                    status:
                        'REUSED',

                    reuseDetectedAt:
                        input.now,

                    revokeReason:
                        'Refresh-token reuse detected',
                },

                $inc: {
                    version:
                        1,
                },

                $currentDate: {
                    updatedAt:
                        true,
                },
            },
        );

        await this.refreshTokens.updateMany(
            {
                familyId:
                    input.familyId,

                tokenId: {
                    $ne:
                        input.presentedTokenId,
                },

                status: {
                    $in: [
                        'ACTIVE',
                        'ROTATED',
                    ],
                },
            },

            {
                $set: {
                    status:
                        'REVOKED',

                    revokedAt:
                        input.now,

                    revokeReason:
                        'Token family compromised',
                },

                $inc: {
                    version:
                        1,
                },

                $currentDate: {
                    updatedAt:
                        true,
                },
            },
        );
    }

    async listUserSessions(
        facilityId: string,
        userId: string,
    ): Promise<SessionRecord[]> {
        return this.sessions
            .find({
                facilityId:
                    toObjectId(
                        facilityId,
                    ),

                userId:
                    toObjectId(
                        userId,
                    ),
            })
            .sort({
                lastSeenAt:
                    -1,
            })
            .limit(100)
            .toArray();
    }
}
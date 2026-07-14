import type {
  IndexDescription,
} from 'mongodb';

import {
  jsonSchemaFor,
} from '../catalog/json-schema.js';

import {
  authSchemas,
  type AuthModelName,
} from '../models/auth.js';

import type {
  Migration,
} from './types.js';

const authenticationCollections:
  readonly AuthModelName[] = [
    'users',
    'sessions',
    'refreshTokens',
  ];

export const authenticationFoundation:
  Migration = {
    id:
      '002-authentication-foundation',

    description:
      'Add explicit authentication validators and indexes',

    async up(
      database,
    ) {
      const existingCollections =
        new Set(
          (
            await database
              .listCollections(
                {},
                {
                  nameOnly:
                    true,
                },
              )
              .toArray()
          ).map(
            (collection) =>
              collection.name,
          ),
        );

      for (
        const name of
        authenticationCollections
      ) {
        const validator = {
          $jsonSchema:
            jsonSchemaFor(
              name,
            ),
        };

        if (
          !existingCollections.has(
            name,
          )
        ) {
          await database.createCollection(
            name,
            {
              validator,

              validationLevel:
                'strict',

              validationAction:
                'error',
            },
          );
        } else {
          await database.command({
            collMod:
              name,

            validator,

            validationLevel:
              'strict',

            validationAction:
              'error',
          });
        }

        const indexes =
          authSchemas[
            name
          ].indexes();

        if (
          indexes.length === 0
        ) {
          continue;
        }

        const descriptions:
          IndexDescription[] =
          indexes.map(
            ([
              keys,
              options,
            ]) => ({
              key:
                keys,

              ...options,
            }),
          );

        await database
          .collection(
            name,
          )
          .createIndexes(
            descriptions,
          );
      }
    },
  };
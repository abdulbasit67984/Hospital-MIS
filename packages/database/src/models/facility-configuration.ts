import mongoose from 'mongoose';

import {
  DepartmentModel,
  departmentSchema,
  departmentStatusValues,
  departmentTypeValues,
} from './department.model.js';
import {
  FacilityModel,
  facilitySchema,
  facilityStatusValues,
  facilityTypeValues,
} from './facility.model.js';
import {
  SettingDefinitionModel,
  settingCategoryValues,
  settingDataTypeValues,
  settingDefinitionSchema,
  settingScopeValues,
} from './setting-definition.model.js';
import {
  SystemSettingModel,
  encryptedSettingAlgorithmValues,
  systemSettingSchema,
} from './system-setting.model.js';
import {
  SystemSettingVersionModel,
  settingChangeSourceValues,
  settingChangeTypeValues,
  systemSettingVersionSchema,
} from './system-setting-version.model.js';

export const facilityTypes = facilityTypeValues;
export const facilityStatuses = facilityStatusValues;
export const departmentTypes = departmentTypeValues;
export const departmentStatuses = departmentStatusValues;
export const settingScopes = settingScopeValues;
export const settingCategories = settingCategoryValues;
export const settingDataTypes = settingDataTypeValues;
export const encryptedSettingAlgorithms =
  encryptedSettingAlgorithmValues;
export const settingChangeTypes = settingChangeTypeValues;
export const settingChangeSources = settingChangeSourceValues;

export const facilityConfigurationSchemas = {
  facilities: facilitySchema,
  departments: departmentSchema,
  settingDefinitions: settingDefinitionSchema,
  systemSettings: systemSettingSchema,
  systemSettingVersions: systemSettingVersionSchema,
} as const;

export const facilityConfigurationModels = {
  facilities: FacilityModel,
  departments: DepartmentModel,
  settingDefinitions: SettingDefinitionModel,
  systemSettings: SystemSettingModel,
  systemSettingVersions: SystemSettingVersionModel,
} as const;

export type FacilityConfigurationModelName =
  keyof typeof facilityConfigurationSchemas;

export function registerFacilityConfigurationModels(
  connection: mongoose.Connection = mongoose.connection,
) {
  return Object.fromEntries(
    Object.entries(facilityConfigurationSchemas).map(
      ([name, schema]) => [
        name,
        connection.models[name] ??
          connection.model(name, schema, name),
      ],
    ),
  );
}
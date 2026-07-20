import type {
  NursingDeteriorationEvaluation,
  NursingObservationThresholdConfiguration,
  NursingObservationTriggeredRule,
  NursingVitalMutationResult,
} from './nursing-observation.contracts.js';

import type {
  NursingObservationThresholdPolicyPort,
} from './nursing-observation.ports.js';

const defaultRules:
NursingObservationThresholdConfiguration['rules'] = [
  {
    code:
      'RESP_CRITICAL_LOW',

    measurement:
      'RESPIRATORY_RATE_PER_MINUTE',

    maximumInclusive:
      8,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critically low respiratory rate',
  },

  {
    code:
      'RESP_LOW',

    measurement:
      'RESPIRATORY_RATE_PER_MINUTE',

    minimumInclusive:
      9,

    maximumInclusive:
      11,

    score:
      1,

    severity:
      'ATTENTION',

    requiresImmediateEscalation:
      false,

    message:
      'Low respiratory rate',
  },

  {
    code:
      'RESP_HIGH',

    measurement:
      'RESPIRATORY_RATE_PER_MINUTE',

    minimumInclusive:
      21,

    maximumInclusive:
      24,

    score:
      2,

    severity:
      'URGENT',

    requiresImmediateEscalation:
      false,

    message:
      'Elevated respiratory rate',
  },

  {
    code:
      'RESP_CRITICAL_HIGH',

    measurement:
      'RESPIRATORY_RATE_PER_MINUTE',

    minimumInclusive:
      25,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critically elevated respiratory rate',
  },

  {
    code:
      'SPO2_CRITICAL',

    measurement:
      'OXYGEN_SATURATION_PERCENT',

    maximumInclusive:
      91,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critical oxygen desaturation',
  },

  {
    code:
      'SPO2_URGENT',

    measurement:
      'OXYGEN_SATURATION_PERCENT',

    minimumInclusive:
      92,

    maximumInclusive:
      93,

    score:
      2,

    severity:
      'URGENT',

    requiresImmediateEscalation:
      false,

    message:
      'Significant oxygen desaturation',
  },

  {
    code:
      'SPO2_ATTENTION',

    measurement:
      'OXYGEN_SATURATION_PERCENT',

    minimumInclusive:
      94,

    maximumInclusive:
      95,

    score:
      1,

    severity:
      'ATTENTION',

    requiresImmediateEscalation:
      false,

    message:
      'Mild oxygen desaturation',
  },

  {
    code:
      'SBP_CRITICAL_LOW',

    measurement:
      'SYSTOLIC_BLOOD_PRESSURE_MMHG',

    maximumInclusive:
      90,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critical hypotension',
  },

  {
    code:
      'SBP_LOW',

    measurement:
      'SYSTOLIC_BLOOD_PRESSURE_MMHG',

    minimumInclusive:
      91,

    maximumInclusive:
      100,

    score:
      2,

    severity:
      'URGENT',

    requiresImmediateEscalation:
      false,

    message:
      'Low systolic blood pressure',
  },

  {
    code:
      'SBP_HIGH',

    measurement:
      'SYSTOLIC_BLOOD_PRESSURE_MMHG',

    minimumInclusive:
      181,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critically high systolic blood pressure',
  },

  {
    code:
      'PULSE_CRITICAL_LOW',

    measurement:
      'PULSE_PER_MINUTE',

    maximumInclusive:
      40,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critical bradycardia',
  },

  {
    code:
      'PULSE_LOW',

    measurement:
      'PULSE_PER_MINUTE',

    minimumInclusive:
      41,

    maximumInclusive:
      50,

    score:
      1,

    severity:
      'ATTENTION',

    requiresImmediateEscalation:
      false,

    message:
      'Bradycardia',
  },

  {
    code:
      'PULSE_HIGH',

    measurement:
      'PULSE_PER_MINUTE',

    minimumInclusive:
      111,

    maximumInclusive:
      130,

    score:
      2,

    severity:
      'URGENT',

    requiresImmediateEscalation:
      false,

    message:
      'Tachycardia',
  },

  {
    code:
      'PULSE_CRITICAL_HIGH',

    measurement:
      'PULSE_PER_MINUTE',

    minimumInclusive:
      131,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critical tachycardia',
  },

  {
    code:
      'TEMP_LOW',

    measurement:
      'TEMPERATURE_CELSIUS',

    maximumInclusive:
      35,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critical hypothermia',
  },

  {
    code:
      'TEMP_HIGH',

    measurement:
      'TEMPERATURE_CELSIUS',

    minimumInclusive:
      38.1,

    maximumInclusive:
      39,

    score:
      1,

    severity:
      'ATTENTION',

    requiresImmediateEscalation:
      false,

    message:
      'Fever',
  },

  {
    code:
      'TEMP_CRITICAL_HIGH',

    measurement:
      'TEMPERATURE_CELSIUS',

    minimumInclusive:
      39.1,

    score:
      2,

    severity:
      'URGENT',

    requiresImmediateEscalation:
      false,

    message:
      'High fever',
  },

  {
    code:
      'GLUCOSE_CRITICAL_LOW',

    measurement:
      'BLOOD_GLUCOSE_MG_DL',

    maximumInclusive:
      54,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critical hypoglycaemia',
  },

  {
    code:
      'GLUCOSE_CRITICAL_HIGH',

    measurement:
      'BLOOD_GLUCOSE_MG_DL',

    minimumInclusive:
      400,

    score:
      3,

    severity:
      'CRITICAL',

    requiresImmediateEscalation:
      true,

    message:
      'Critical hyperglycaemia',
  },

  {
    code:
      'PAIN_SEVERE',

    measurement:
      'PAIN_SCORE',

    minimumInclusive:
      8,

    score:
      2,

    severity:
      'URGENT',

    requiresImmediateEscalation:
      false,

    message:
      'Severe pain',
  },
];

function numberValue(
  value:
    | string
    | number
    | null,
): number | null {
  if (
    value == null
  ) {
    return null;
  }

  const parsed =
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function measurementValue(
  measurement:
    NursingObservationThresholdConfiguration[
      'rules'
    ][number]['measurement'],

  vital:
    NursingVitalMutationResult,
): number | null {
  switch (
    measurement
  ) {
    case 'TEMPERATURE_CELSIUS':
      return numberValue(
        vital.temperatureCelsius,
      );

    case 'PULSE_PER_MINUTE':
      return numberValue(
        vital.pulsePerMinute,
      );

    case 'RESPIRATORY_RATE_PER_MINUTE':
      return numberValue(
        vital.respiratoryRatePerMinute,
      );

    case 'SYSTOLIC_BLOOD_PRESSURE_MMHG':
      return numberValue(
        vital.systolicBloodPressureMmHg,
      );

    case 'DIASTOLIC_BLOOD_PRESSURE_MMHG':
      return numberValue(
        vital.diastolicBloodPressureMmHg,
      );

    case 'OXYGEN_SATURATION_PERCENT':
      return numberValue(
        vital.oxygenSaturationPercent,
      );

    case 'BLOOD_GLUCOSE_MG_DL':
      return numberValue(
        vital.bloodGlucoseMgDl,
      );

    case 'PAIN_SCORE':
      return numberValue(
        vital.painScore,
      );
  }
}

function matches(
  value: number,
  minimum?: number | null,
  maximum?: number | null,
): boolean {
  return (
    (
      minimum == null ||
      value >= minimum
    ) &&
    (
      maximum == null ||
      value <= maximum
    )
  );
}

export class DefaultNursingObservationThresholdPolicy
implements NursingObservationThresholdPolicyPort {
  public constructor(
    private readonly configurationReader?:
      Readonly<{
        find(
          facilityId: string,
          wardId: string,
        ): Promise<
          NursingObservationThresholdConfiguration |
          null
        >;
      }>,
  ) {}

  public async resolve(
    facilityId: string,
    wardId: string,
  ): Promise<NursingObservationThresholdConfiguration> {
    const configured =
      await this.configurationReader
        ?.find(
          facilityId,
          wardId,
        );

    return configured ?? {
      facilityId,
      wardId,
      configurationVersion:
        1,
      rules:
        defaultRules,
      supplementalOxygenScore:
        2,
      urgentScoreThreshold:
        4,
      criticalScoreThreshold:
        7,
    };
  }

  public evaluate(
    configuration:
      NursingObservationThresholdConfiguration,

    vitalSign:
      NursingVitalMutationResult,
  ): NursingDeteriorationEvaluation {
    const triggeredRules:
      NursingObservationTriggeredRule[] = [];

    for (
      const rule of
      configuration.rules
    ) {
      const observedValue =
        measurementValue(
          rule.measurement,
          vitalSign,
        );

      if (
        observedValue == null ||
        !matches(
          observedValue,
          rule.minimumInclusive,
          rule.maximumInclusive,
        )
      ) {
        continue;
      }

      triggeredRules.push({
        code:
          rule.code,
        measurement:
          rule.measurement,
        observedValue,
        score:
          rule.score,
        severity:
          rule.severity,
        requiresImmediateEscalation:
          rule.requiresImmediateEscalation,
        message:
          rule.message,
      });
    }

    const oxygenScore =
      vitalSign.oxygenDeliveryMethod ==
      null
        ? 0
        : configuration
            .supplementalOxygenScore;

    const totalScore =
      triggeredRules.reduce(
        (
          sum,
          rule,
        ) =>
          sum +
          rule.score,
        oxygenScore,
      );

    const immediate =
      triggeredRules.some(
        (rule) =>
          rule.requiresImmediateEscalation,
      );

    const severity =
      immediate ||
      totalScore >=
        configuration
          .criticalScoreThreshold
        ? 'CRITICAL'
        : totalScore >=
            configuration
              .urgentScoreThreshold
          ? 'URGENT'
          : totalScore > 0
            ? 'ATTENTION'
            : 'ROUTINE';

    return {
      configurationVersion:
        configuration
          .configurationVersion,

      totalScore,

      severity,

      requiresEscalation:
        severity ===
          'URGENT' ||
        severity ===
          'CRITICAL',

      requiresImmediateEscalation:
        immediate,

      triggeredRules,
    };
  }
}
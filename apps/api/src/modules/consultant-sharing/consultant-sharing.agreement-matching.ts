import type {
  ConsultantAgreementMatchCandidate,
  ConsultantAgreementMatchContext,
  ConsultantAgreementMatchRanking,
  ConsultantAgreementMatchResult,
  ConsultantAgreementRuleDefinition,
} from './consultant-sharing.contracts.js';
import {
  ConsultantAgreementAmbiguousMatchError,
  ConsultantAgreementConflictError,
  ConsultantAgreementNoMatchError,
} from './consultant-sharing.errors.js';

const specificityWeights = {
  consultantGroupId: 2,
  departmentId: 4,
  serviceCategory: 5,
  serviceId: 8,
  chargeCatalogItemId: 12,
  procedureId: 12,
  patientType: 3,
  encounterType: 3,
  admissionType: 3,
  payerOrganizationId: 7,
  panelProgramId: 8,
  packageId: 9,
  claimType: 4,
} as const;

type MatchDimension = keyof typeof specificityWeights;

const matchDimensions = Object.keys(specificityWeights) as MatchDimension[];

function normalizeComparable(value: string | null | undefined): string | null {
  return value == null ? null : value.trim().toUpperCase();
}

function ruleMatchesDimension(
  ruleValue: string | null,
  contextValue: string | null | undefined,
): boolean {
  return ruleValue === null ||
    normalizeComparable(ruleValue) === normalizeComparable(contextValue);
}

function effectiveAt(
  rule: ConsultantAgreementRuleDefinition,
  financialEventAt: string,
): boolean {
  const eventAt = Date.parse(financialEventAt);
  const from = Date.parse(rule.effectiveFrom);
  const through =
    rule.effectiveThrough === null ? null : Date.parse(rule.effectiveThrough);
  return eventAt >= from && (through === null || eventAt <= through);
}

function matchingDimensions(
  rule: ConsultantAgreementRuleDefinition,
  context: ConsultantAgreementMatchContext,
): readonly string[] | null {
  if (rule.facilityId !== context.facilityId) {
    return null;
  }
  if (rule.consultantId !== context.consultantId) {
    return null;
  }
  if (!effectiveAt(rule, context.financialEventAt)) {
    return null;
  }

  const matches: string[] = [];
  for (const dimension of matchDimensions) {
    const ruleValue = rule[dimension];
    const contextValue = context[dimension];
    if (!ruleMatchesDimension(ruleValue, contextValue)) {
      return null;
    }
    if (ruleValue !== null) {
      matches.push(dimension);
    }
  }

  return matches;
}

function calculateSpecificityScore(
  matchedDimensions: readonly string[],
): number {
  return matchedDimensions.reduce((score, dimension) => {
    const weight = specificityWeights[dimension as MatchDimension];
    return score + (weight ?? 0);
  }, 0);
}

function buildRanking(
  candidate: ConsultantAgreementMatchCandidate,
  matchedDimensions: readonly string[],
): ConsultantAgreementMatchRanking {
  return {
    ruleId: candidate.rule.id,
    agreementId: candidate.agreementId,
    rulePriority: candidate.rule.priority,
    specificityScore: calculateSpecificityScore(matchedDimensions),
    matchedDimensions,
    agreementPriority: candidate.agreementPriority,
    agreementVersion: candidate.agreementVersion,
    ruleVersion: candidate.rule.ruleVersion,
    fallback: candidate.rule.isFallback,
  };
}

function compareRankings(
  left: ConsultantAgreementMatchRanking,
  right: ConsultantAgreementMatchRanking,
): number {
  if (left.fallback !== right.fallback) {
    return left.fallback ? 1 : -1;
  }
  if (left.rulePriority !== right.rulePriority) {
    return right.rulePriority - left.rulePriority;
  }
  if (left.specificityScore !== right.specificityScore) {
    return right.specificityScore - left.specificityScore;
  }
  if (left.agreementPriority !== right.agreementPriority) {
    return right.agreementPriority - left.agreementPriority;
  }
  if (left.agreementVersion !== right.agreementVersion) {
    return right.agreementVersion - left.agreementVersion;
  }
  if (left.ruleVersion !== right.ruleVersion) {
    return right.ruleVersion - left.ruleVersion;
  }
  return left.ruleId.localeCompare(right.ruleId);
}

function sameBusinessRank(
  left: ConsultantAgreementMatchRanking,
  right: ConsultantAgreementMatchRanking,
): boolean {
  return left.fallback === right.fallback &&
    left.rulePriority === right.rulePriority &&
    left.specificityScore === right.specificityScore &&
    left.agreementPriority === right.agreementPriority &&
    left.agreementVersion === right.agreementVersion &&
    left.ruleVersion === right.ruleVersion;
}

function sameCalculation(candidateA: ConsultantAgreementMatchCandidate, candidateB: ConsultantAgreementMatchCandidate): boolean {
  return candidateA.rule.calculationFingerprint ===
    candidateB.rule.calculationFingerprint;
}

export function selectConsultantAgreementRule(
  candidates: readonly ConsultantAgreementMatchCandidate[],
  context: ConsultantAgreementMatchContext,
): ConsultantAgreementMatchResult {
  const historicallyEligibleAgreementStatuses = new Set([
    'ACTIVE',
    'SUPERSEDED',
    'EXPIRED',
    'TERMINATED',
  ]);
  const historicallyEligibleRuleStatuses = new Set(['ACTIVE', 'SUPERSEDED']);
  const evaluated = candidates.filter(
    (candidate) =>
      historicallyEligibleAgreementStatuses.has(candidate.agreementStatus) &&
      historicallyEligibleRuleStatuses.has(candidate.rule.status),
  );

  const ranked = evaluated
    .map((candidate) => {
      const matched = matchingDimensions(candidate.rule, context);
      return matched === null
        ? null
        : {
            candidate,
            ranking: buildRanking(candidate, matched),
          };
    })
    .filter(
      (
        value,
      ): value is Readonly<{
        candidate: ConsultantAgreementMatchCandidate;
        ranking: ConsultantAgreementMatchRanking;
      }> => value !== null,
    )
    .sort((left, right) => compareRankings(left.ranking, right.ranking));

  const selected = ranked[0];
  if (selected === undefined) {
    throw new ConsultantAgreementNoMatchError();
  }

  const tied = ranked.filter((entry) =>
    sameBusinessRank(entry.ranking, selected.ranking),
  );
  if (
    tied.length > 1 &&
    tied.some((entry) => !sameCalculation(entry.candidate, selected.candidate))
  ) {
    throw new ConsultantAgreementAmbiguousMatchError(
      tied.map((entry) => entry.candidate.rule.id),
    );
  }

  const reasonParts = [
    selected.ranking.fallback ? 'fallback rule' : 'specific rule',
    `rule priority ${selected.ranking.rulePriority}`,
    `specificity ${selected.ranking.specificityScore}`,
    `agreement priority ${selected.ranking.agreementPriority}`,
    `agreement version ${selected.ranking.agreementVersion}`,
    `rule version ${selected.ranking.ruleVersion}`,
  ];

  return {
    selected: selected.candidate,
    ranking: selected.ranking,
    evaluatedCandidateCount: candidates.length,
    effectiveCandidateCount: ranked.length,
    selectionReason: reasonParts.join('; '),
  };
}

function dateRangesOverlap(
  leftFrom: string,
  leftThrough: string | null,
  rightFrom: string,
  rightThrough: string | null,
): boolean {
  const leftStart = Date.parse(leftFrom);
  const leftEnd = leftThrough === null ? Number.POSITIVE_INFINITY : Date.parse(leftThrough);
  const rightStart = Date.parse(rightFrom);
  const rightEnd = rightThrough === null ? Number.POSITIVE_INFINITY : Date.parse(rightThrough);
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function sameScope(
  left: ConsultantAgreementRuleDefinition,
  right: ConsultantAgreementRuleDefinition,
): boolean {
  return left.facilityId === right.facilityId &&
    left.consultantId === right.consultantId &&
    matchDimensions.every(
      (dimension) =>
        normalizeComparable(left[dimension]) ===
        normalizeComparable(right[dimension]),
    );
}

export function detectConsultantAgreementRuleConflicts(
  candidates: readonly ConsultantAgreementMatchCandidate[],
): readonly Readonly<{
  leftRuleId: string;
  rightRuleId: string;
  reason: string;
}>[] {
  const conflicts: Array<Readonly<{
    leftRuleId: string;
    rightRuleId: string;
    reason: string;
  }>> = [];

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    if (left === undefined || left.rule.status !== 'ACTIVE') {
      continue;
    }
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidates.length;
      rightIndex += 1
    ) {
      const right = candidates[rightIndex];
      if (right === undefined || right.rule.status !== 'ACTIVE') {
        continue;
      }
      if (!sameScope(left.rule, right.rule)) {
        continue;
      }
      if (
        !dateRangesOverlap(
          left.rule.effectiveFrom,
          left.rule.effectiveThrough,
          right.rule.effectiveFrom,
          right.rule.effectiveThrough,
        )
      ) {
        continue;
      }
      if (
        left.rule.priority !== right.rule.priority ||
        left.agreementPriority !== right.agreementPriority ||
        left.rule.isFallback !== right.rule.isFallback
      ) {
        continue;
      }
      if (sameCalculation(left, right)) {
        continue;
      }

      conflicts.push({
        leftRuleId: left.rule.id,
        rightRuleId: right.rule.id,
        reason:
          'Overlapping effective rules have the same scope and priority but different calculation fingerprints',
      });
    }
  }

  return conflicts;
}

export function assertNoConsultantAgreementRuleConflicts(
  candidates: readonly ConsultantAgreementMatchCandidate[],
): void {
  const conflicts = detectConsultantAgreementRuleConflicts(candidates);
  if (conflicts.length > 0) {
    throw new ConsultantAgreementConflictError(
      conflicts.map((conflict) => conflict.reason).join('; '),
    );
  }
}
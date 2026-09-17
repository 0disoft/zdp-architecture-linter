import type { ArchitectureCatalogs } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';

const POLICY_FILE = 'rules/tier.rules.yaml';
const SERVICE_FILE = 'catalogs/services.yaml';
const OPERATIONAL_ASSET_FILE = 'catalogs/operational-assets.yaml';
const POLICY_RULE_ID = 'ZDP-STATE-TRANSITION-000';
const SERVICE_RULE_ID = 'ZDP-STATE-TRANSITION-001';
const OPERATIONAL_ASSET_RULE_ID = 'ZDP-STATE-TRANSITION-002';
const ABSENT_STATUS = 'absent';

interface ParsedStateTransitionPolicy {
  readonly evidenceMaxAgeDays: number;
  readonly requiredEvidenceFields: readonly string[];
  readonly serviceStatuses: ReadonlySet<string>;
  readonly operationalAssetStatuses: ReadonlySet<string>;
}

interface IndexedRecord {
  readonly id: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export function createStateTransitionDiagnostics(input: {
  readonly baseCatalogs: ArchitectureCatalogs;
  readonly headCatalogs: ArchitectureCatalogs;
  readonly observedAt?: Date;
}): readonly Diagnostic[] {
  const parsedPolicy = parseStateTransitionPolicy(input.headCatalogs.tierRules);

  if ('diagnostic' in parsedPolicy) {
    return parsedPolicy.diagnostic === null ? [] : [parsedPolicy.diagnostic];
  }

  const observedAt = input.observedAt ?? new Date();

  return [
    ...validateCollectionTransitions({
      baseItems: indexRecords(input.baseCatalogs.services.services, 'id'),
      headItems: indexRecords(input.headCatalogs.services.services, 'id'),
      gatedStatuses: parsedPolicy.policy.serviceStatuses,
      requiredEvidenceFields: parsedPolicy.policy.requiredEvidenceFields,
      evidenceMaxAgeDays: parsedPolicy.policy.evidenceMaxAgeDays,
      observedAt,
      diagnostic: {
        ruleId: SERVICE_RULE_ID,
        file: SERVICE_FILE,
        collection: 'services'
      }
    }),
    ...validateCollectionTransitions({
      baseItems: indexRecords(
        input.baseCatalogs.operationalAssets?.assets,
        'id'
      ),
      headItems: indexRecords(
        input.headCatalogs.operationalAssets?.assets,
        'id'
      ),
      gatedStatuses: parsedPolicy.policy.operationalAssetStatuses,
      requiredEvidenceFields: parsedPolicy.policy.requiredEvidenceFields,
      evidenceMaxAgeDays: parsedPolicy.policy.evidenceMaxAgeDays,
      observedAt,
      diagnostic: {
        ruleId: OPERATIONAL_ASSET_RULE_ID,
        file: OPERATIONAL_ASSET_FILE,
        collection: 'assets'
      },
      crossCheckOperationalEvidence: true
    })
  ];
}

function parseStateTransitionPolicy(
  value: unknown
):
  | { readonly policy: ParsedStateTransitionPolicy }
  | { readonly diagnostic: Diagnostic | null } {
  if (!isRecord(value) || value.state_transition_evidence === undefined) {
    return { diagnostic: null };
  }

  if (!isRecord(value.state_transition_evidence)) {
    return {
      diagnostic: {
        ruleId: POLICY_RULE_ID,
        severity: 'error',
        file: POLICY_FILE,
        path: 'state_transition_evidence',
        message: 'State transition policy must be an object.'
      }
    };
  }

  const policyValue = value.state_transition_evidence;
  const schemaVersion = policyValue.schema_version;
  const evidenceMaxAgeDays = policyValue.evidence_max_age_days;
  const requiredEvidenceFields = readStringList(
    policyValue.required_evidence_fields
  );
  const serviceStatuses = readStringList(
    policyValue.service_statuses_requiring_evidence
  );
  const operationalAssetStatuses = readStringList(
    policyValue.operational_asset_statuses_requiring_evidence
  );
  const issues: string[] = [];

  if (schemaVersion !== 1 && schemaVersion !== '1') {
    issues.push('schema_version must be 1');
  }

  if (
    typeof evidenceMaxAgeDays !== 'number' ||
    !Number.isInteger(evidenceMaxAgeDays) ||
    evidenceMaxAgeDays < 1
  ) {
    issues.push('evidence_max_age_days must be a positive integer');
  }

  if (requiredEvidenceFields === null || requiredEvidenceFields.length === 0) {
    issues.push('required_evidence_fields must contain at least one field');
  }

  if (serviceStatuses === null || serviceStatuses.length === 0) {
    issues.push(
      'service_statuses_requiring_evidence must contain at least one status'
    );
  }

  if (
    operationalAssetStatuses === null ||
    operationalAssetStatuses.length === 0
  ) {
    issues.push(
      'operational_asset_statuses_requiring_evidence must contain at least one status'
    );
  }

  if (issues.length > 0) {
    return {
      diagnostic: {
        ruleId: POLICY_RULE_ID,
        severity: 'error',
        file: POLICY_FILE,
        path: 'state_transition_evidence',
        message: `State transition policy is invalid: ${issues.join('; ')}.`
      }
    };
  }

  return {
    policy: {
      evidenceMaxAgeDays: evidenceMaxAgeDays as number,
      requiredEvidenceFields: requiredEvidenceFields as readonly string[],
      serviceStatuses: new Set(serviceStatuses as readonly string[]),
      operationalAssetStatuses: new Set(
        operationalAssetStatuses as readonly string[]
      )
    }
  };
}

function validateCollectionTransitions(input: {
  readonly baseItems: ReadonlyMap<string, IndexedRecord>;
  readonly headItems: ReadonlyMap<string, IndexedRecord>;
  readonly gatedStatuses: ReadonlySet<string>;
  readonly requiredEvidenceFields: readonly string[];
  readonly evidenceMaxAgeDays: number;
  readonly observedAt: Date;
  readonly diagnostic: {
    readonly ruleId: string;
    readonly file: string;
    readonly collection: string;
  };
  readonly crossCheckOperationalEvidence?: boolean;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const [id, headItem] of input.headItems) {
    const headStatus = readNonEmptyString(headItem.value.status);

    if (headStatus === null || !input.gatedStatuses.has(headStatus)) {
      continue;
    }

    const baseItem = input.baseItems.get(id);
    const baseStatus =
      readNonEmptyString(baseItem?.value.status) ?? ABSENT_STATUS;

    if (baseStatus === headStatus) {
      continue;
    }

    const issues = validateTransitionEvidence({
      value: headItem.value.transition_evidence,
      fromStatus: baseStatus,
      toStatus: headStatus,
      requiredEvidenceFields: input.requiredEvidenceFields,
      evidenceMaxAgeDays: input.evidenceMaxAgeDays,
      observedAt: input.observedAt,
      operationalEvidence: input.crossCheckOperationalEvidence
        ? headItem.value.evidence
        : undefined
    });

    if (issues.length === 0) {
      continue;
    }

    diagnostics.push({
      ruleId: input.diagnostic.ruleId,
      severity: 'error',
      file: input.diagnostic.file,
      path: `${input.diagnostic.collection}[id=${id}].transition_evidence`,
      message:
        `State transition ${baseStatus} -> ${headStatus} for ` +
        `\`${id}\` requires fresh evidence: ${issues.join('; ')}.`
    });
  }

  return diagnostics;
}

function validateTransitionEvidence(input: {
  readonly value: unknown;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly requiredEvidenceFields: readonly string[];
  readonly evidenceMaxAgeDays: number;
  readonly observedAt: Date;
  readonly operationalEvidence?: unknown;
}): readonly string[] {
  if (!isRecord(input.value)) {
    return ['transition_evidence must be an object'];
  }

  const evidence = input.value;
  const issues: string[] = [];

  if (readNonEmptyString(evidence.from_status) !== input.fromStatus) {
    issues.push(`from_status must equal ${input.fromStatus}`);
  }

  if (readNonEmptyString(evidence.to_status) !== input.toStatus) {
    issues.push(`to_status must equal ${input.toStatus}`);
  }

  const verifiedAt = readNonEmptyString(evidence.verified_at);
  const verifiedDay = verifiedAt === null ? null : parseUtcDate(verifiedAt);

  if (verifiedDay === null) {
    issues.push('verified_at must be a valid YYYY-MM-DD date');
  } else {
    const observedDay = Date.UTC(
      input.observedAt.getUTCFullYear(),
      input.observedAt.getUTCMonth(),
      input.observedAt.getUTCDate()
    );
    const ageDays = Math.floor(
      (observedDay - verifiedDay) / (24 * 60 * 60 * 1000)
    );

    if (ageDays < 0) {
      issues.push('verified_at cannot be in the future');
    } else if (ageDays > input.evidenceMaxAgeDays) {
      issues.push(
        `verified_at is ${ageDays} days old and exceeds ` +
          `evidence_max_age_days=${input.evidenceMaxAgeDays}`
      );
    }
  }

  for (const field of input.requiredEvidenceFields) {
    if (field === 'evidence_refs') {
      const refs = readStringList(evidence[field]);

      if (refs === null) {
        issues.push('evidence_refs must contain only non-empty strings');
      } else if (refs.length === 0) {
        issues.push('evidence_refs must contain at least one reference');
      }
      continue;
    }

    if (field === 'monthly_budget_limit_usd') {
      const value = evidence[field];
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0
      ) {
        issues.push(
          'monthly_budget_limit_usd must be a finite non-negative number'
        );
      }
      continue;
    }

    if (readNonEmptyString(evidence[field]) === null) {
      issues.push(`${field} must be a non-empty string`);
    }
  }

  if (input.operationalEvidence !== undefined) {
    crossCheckOperationalEvidence({
      transitionEvidence: evidence,
      operationalEvidence: input.operationalEvidence,
      issues
    });
  }

  return issues;
}

function crossCheckOperationalEvidence(input: {
  readonly transitionEvidence: Readonly<Record<string, unknown>>;
  readonly operationalEvidence: unknown;
  readonly issues: string[];
}): void {
  if (!isRecord(input.operationalEvidence)) {
    input.issues.push('operational asset evidence must be an object');
    return;
  }

  const transitionVerifiedAt = readNonEmptyString(
    input.transitionEvidence.verified_at
  );
  const assetVerifiedAt = readNonEmptyString(
    input.operationalEvidence.last_verified_at
  );

  if (
    transitionVerifiedAt !== null &&
    assetVerifiedAt !== transitionVerifiedAt
  ) {
    input.issues.push(
      'verified_at must match evidence.last_verified_at for operational assets'
    );
  }

  const transitionRefs = readStringList(
    input.transitionEvidence.evidence_refs
  );
  const assetRefs = readStringList(input.operationalEvidence.refs);

  if (transitionRefs === null || assetRefs === null) {
    return;
  }

  const assetRefSet = new Set(assetRefs);
  const missingRefs = transitionRefs.filter((ref) => !assetRefSet.has(ref));

  if (missingRefs.length > 0) {
    input.issues.push(
      'evidence_refs must also appear in operational asset evidence.refs'
    );
  }
}

function indexRecords(
  value: unknown,
  idField: string
): ReadonlyMap<string, IndexedRecord> {
  const result = new Map<string, IndexedRecord>();

  if (!Array.isArray(value)) {
    return result;
  }

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const id = readNonEmptyString(item[idField]);

    if (id !== null && !result.has(id)) {
      result.set(id, { id, value: item });
    }
  }

  return result;
}

function readStringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value.map(readNonEmptyString);

  if (normalized.some((item) => item === null)) {
    return null;
  }

  return [...new Set(normalized as string[])];
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseUtcDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? timestamp
    : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

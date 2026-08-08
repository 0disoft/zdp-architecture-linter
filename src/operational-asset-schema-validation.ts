import { join } from 'node:path';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { OperationalAssetsCatalog } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';
import { compileJsonSchemaFile } from './json-schema-validator-cache.ts';

const OPERATIONAL_ASSET_SCHEMA_FILE = 'schemas/operational-asset.schema.json';
const OPERATIONAL_ASSET_CATALOG_FILE = 'catalogs/operational-assets.yaml';
const OPERATIONAL_ASSET_SCHEMA_RULE_ID = 'ZDP-OPS-ASSET-001';
const OPERATIONAL_ASSET_DRIFT_RULE_ID = 'ZDP-OPS-ASSET-002';
const SCHEMA_ERROR_DISPLAY_LIMIT = 5;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export async function validateOperationalAssetCatalogSchema(input: {
  readonly architectureRoot: string;
  readonly value: OperationalAssetsCatalog | undefined;
  readonly observedAt?: Date;
}): Promise<readonly Diagnostic[]> {
  const validate = await compileOperationalAssetSchema(input.architectureRoot);
  const valid = validate(input.value);
  const errors = validate.errors ?? [];

  if (!valid) {
    return [
      {
        ruleId: OPERATIONAL_ASSET_SCHEMA_RULE_ID,
        severity: 'error',
        file: OPERATIONAL_ASSET_CATALOG_FILE,
        path: toDiagnosticPath(errors[0]),
        message:
          `Operational asset catalog violates \`${OPERATIONAL_ASSET_SCHEMA_FILE}\`: ${formatSchemaErrors(errors)}`
      }
    ];
  }

  return validateOperationalAssetDrift(
    input.value as ValidOperationalAssetsCatalog,
    input.observedAt ?? new Date()
  );
}

interface ValidOperationalAssetsCatalog {
  readonly policy: { readonly review_interval_days: number };
  readonly assets: readonly ValidOperationalAsset[];
}

interface ValidOperationalAsset {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly lifecycle: {
    readonly expires_at: string | null;
  };
  readonly security: {
    readonly public_access: boolean;
  };
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
  readonly evidence: {
    readonly last_verified_at: string;
  };
}

function validateOperationalAssetDrift(
  catalog: ValidOperationalAssetsCatalog,
  observedAt: Date
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const assetById = new Map<string, ValidOperationalAsset>();
  const observedDay = Date.UTC(
    observedAt.getUTCFullYear(),
    observedAt.getUTCMonth(),
    observedAt.getUTCDate()
  );

  catalog.assets.forEach((asset, index) => {
    if (assetById.has(asset.id)) {
      diagnostics.push(
        driftDiagnostic(
          `assets.${index}.id`,
          `Operational asset id \`${asset.id}\` is duplicated; drift checks require one authoritative record per asset.`
        )
      );
    } else {
      assetById.set(asset.id, asset);
    }

    if (asset.status === 'retired') {
      return;
    }

    const verifiedDay = parseUtcDate(asset.evidence.last_verified_at);
    const ageDays = Math.floor((observedDay - verifiedDay) / MILLISECONDS_PER_DAY);

    if (ageDays < 0) {
      diagnostics.push(
        driftDiagnostic(
          `assets.${index}.evidence.last_verified_at`,
          `Operational asset \`${asset.id}\` has future verification date \`${asset.evidence.last_verified_at}\` relative to ${formatUtcDate(observedAt)}.`
        )
      );
    } else if (ageDays > catalog.policy.review_interval_days) {
      diagnostics.push(
        driftDiagnostic(
          `assets.${index}.evidence.last_verified_at`,
          `Operational asset \`${asset.id}\` evidence is ${ageDays} days old, exceeding policy.review_interval_days=${catalog.policy.review_interval_days}; reconcile provider state and refresh non-secret evidence.`
        )
      );
    }

    if (
      asset.kind === 'domain' &&
      asset.lifecycle.expires_at !== null &&
      Date.parse(asset.lifecycle.expires_at) <= observedAt.getTime()
    ) {
      diagnostics.push(
        driftDiagnostic(
          `assets.${index}.lifecycle.expires_at`,
          `Operational domain asset \`${asset.id}\` expired at \`${asset.lifecycle.expires_at}\`; renew, retire, or replace it before operational completion.`
        )
      );
    }
  });

  catalog.assets.forEach((asset, index) => {
    const backupAssetId = asset.details?.backup_asset_id;

    if (typeof backupAssetId !== 'string') {
      return;
    }

    const backupAsset = assetById.get(backupAssetId);
    if (backupAsset === undefined) {
      diagnostics.push(
        driftDiagnostic(
          `assets.${index}.details.backup_asset_id`,
          `Operational asset \`${asset.id}\` references missing backup asset \`${backupAssetId}\`.`
        )
      );
    } else if (
      backupAsset.kind !== 'object-storage' ||
      backupAsset.security.public_access !== false ||
      (asset.status === 'active' && backupAsset.status !== 'active')
    ) {
      diagnostics.push(
        driftDiagnostic(
          `assets.${index}.details.backup_asset_id`,
          `Operational asset \`${asset.id}\` backup reference \`${backupAssetId}\` must resolve to an active, private object-storage asset.`
        )
      );
    }
  });

  return diagnostics;
}

function driftDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: OPERATIONAL_ASSET_DRIFT_RULE_ID,
    severity: 'error',
    file: OPERATIONAL_ASSET_CATALOG_FILE,
    path,
    message
  };
}

function parseUtcDate(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function formatUtcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function compileOperationalAssetSchema(
  architectureRoot: string
): Promise<ValidateFunction> {
  return compileJsonSchemaFile({
    absolutePath: join(architectureRoot, OPERATIONAL_ASSET_SCHEMA_FILE)
  });
}

function formatSchemaErrors(errors: readonly ErrorObject[]): string {
  const summary = errors
    .slice(0, SCHEMA_ERROR_DISPLAY_LIMIT)
    .map((error) => `${toDiagnosticPath(error)} ${error.message ?? 'is invalid'}`)
    .join('; ');
  const remaining = errors.length - SCHEMA_ERROR_DISPLAY_LIMIT;

  return remaining > 0
    ? `${summary}; and ${remaining} more schema error${remaining === 1 ? '' : 's'}`
    : summary;
}

function toDiagnosticPath(error: ErrorObject | undefined): string {
  if (error === undefined) {
    return 'schema';
  }

  const instancePath = error.instancePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('.');

  return instancePath.length > 0 ? instancePath : 'schema';
}

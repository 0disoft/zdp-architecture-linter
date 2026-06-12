import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const SERVICE_CONTRACT_FILE = 'service.yaml';
const TERM_ADS_HOVER_RULE_ID = 'ZDP-XCUT-TERM-ADS-001';
const TERM_ADS_SHEET_RULE_ID = 'ZDP-XCUT-TERM-ADS-002';
const TERM_ID_RULE_ID = 'ZDP-XCUT-TERM-001';
const TERM_MANIFEST_RULE_ID = 'ZDP-XCUT-TERM-007';

const GLOSSARY_SOURCE_DIR = 'glossary/terms';
const RUNTIME_MANIFEST_PATH = 'src/content/glossary-manifest.json';

const GLOSSARY_SURFACE_MARKERS = [
  'glossary',
  'term sheet',
  'term_id',
  'data-term-id',
  '용어',
  '용어 설명'
] as const;

const HOVER_SURFACE_MARKERS = [
  'hover card',
  'hover tooltip',
  'hover-only',
  'hover UI',
  'hover 표면',
  'hover tooltip/card',
  '호버',
  '툴팁'
] as const;

const AD_MARKERS = [
  'ad slot',
  'adsense',
  'ezoic',
  'advertising',
  'advertisement',
  'ad provider',
  'iframe',
  'provider script',
  'script tag',
  'script 삽입',
  '광고'
] as const;

const FORBIDDEN_MARKERS = [
  'forbidden',
  'not allowed',
  'prohibited',
  '금지',
  '허용하지',
  '허용 안'
] as const;

const TERM_SHEET_MARKERS = [
  'term sheet',
  'right sheet',
  'bottom sheet',
  '설명 sheet',
  '설명 시트'
] as const;

const TERM_SHEET_AD_EXCLUSION_MARKERS = [
  'do not include ad slots',
  'must not contain ad slots',
  'must not include ad slots',
  'ad slots prohibited',
  '광고 slot 금지',
  '광고 슬롯 금지',
  '광고 슬롯을 넣지 않는다',
  '광고 provider, iframe, script 또는 광고 슬롯',
  'data-zdp-ad-exclude'
] as const;

export async function validateRepositoryTermSheetContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const serviceContractText = stringify(input.repositoryServiceContract);
  const hasGlossarySource = await pathExists(input.repositoryRoot, GLOSSARY_SOURCE_DIR);
  const hasRuntimeManifest = await pathExists(
    input.repositoryRoot,
    RUNTIME_MANIFEST_PATH
  );

  if (
    !declaresGlossarySurface(serviceContractText) &&
    !hasGlossarySource &&
    !hasRuntimeManifest
  ) {
    return [];
  }

  return [
    ...validateHoverAdPolicy(serviceContractText),
    ...validateTermSheetAdPolicy(serviceContractText),
    ...validateTermIdContract(serviceContractText),
    ...validateManifestSourceContract({
      hasGlossarySource,
      hasRuntimeManifest
    })
  ];
}

function validateHoverAdPolicy(source: string): readonly Diagnostic[] {
  if (!hasAny(source, HOVER_SURFACE_MARKERS) || !hasAny(source, AD_MARKERS)) {
    return [];
  }

  if (hasAny(source, FORBIDDEN_MARKERS)) {
    return [];
  }

  return [
    createTermDiagnostic({
      ruleId: TERM_ADS_HOVER_RULE_ID,
      severity: 'error',
      path: 'notes',
      message:
        'Glossary hover tooltip/card surfaces must not contain ad slots or ad providers; use click-open Term Sheet or Term Detail Page surfaces instead.'
    })
  ];
}

function validateTermSheetAdPolicy(source: string): readonly Diagnostic[] {
  if (!hasAny(source, TERM_SHEET_MARKERS) || !hasAny(source, AD_MARKERS)) {
    return [];
  }

  if (hasAny(source, TERM_SHEET_AD_EXCLUSION_MARKERS)) {
    return [];
  }

  return [
    createTermDiagnostic({
      ruleId: TERM_ADS_SHEET_RULE_ID,
      severity: 'error',
      path: 'notes',
      message:
        'MVP Term Sheet surfaces must not contain ad slots, ad providers, iframes, or scripts; use a separate Term Detail Page experiment contract for ads.'
    })
  ];
}

function validateTermIdContract(source: string): readonly Diagnostic[] {
  if (hasAny(source, ['term_id', 'data-term-id'])) {
    return [];
  }

  return [
    createTermDiagnostic({
      ruleId: TERM_ID_RULE_ID,
      severity: 'warning',
      path: 'notes',
      message:
        'Glossary surfaces should declare stable `term_id` ownership so labels, aliases, translations, analytics, and sheet events do not use display text as identity.'
    })
  ];
}

function validateManifestSourceContract(input: {
  readonly hasGlossarySource: boolean;
  readonly hasRuntimeManifest: boolean;
}): readonly Diagnostic[] {
  if (!input.hasRuntimeManifest || input.hasGlossarySource) {
    return [];
  }

  return [
    createTermDiagnostic({
      ruleId: TERM_MANIFEST_RULE_ID,
      severity: 'warning',
      path: 'repository.root',
      message:
        '`src/content/glossary-manifest.json` is generated runtime state and should have `glossary/terms` YAML source in the repository contract so CI can detect stale manifest drift.'
    })
  ];
}

function declaresGlossarySurface(source: string): boolean {
  return hasAny(source, GLOSSARY_SURFACE_MARKERS);
}

function hasAny(source: string, markers: readonly string[]): boolean {
  const normalized = source.toLowerCase();

  return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

async function pathExists(repositoryRoot: string, path: string): Promise<boolean> {
  try {
    await stat(join(repositoryRoot, path));
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function createTermDiagnostic(input: {
  readonly ruleId: string;
  readonly severity: Diagnostic['severity'];
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: input.ruleId,
    severity: input.severity,
    file: SERVICE_CONTRACT_FILE,
    path: input.path,
    message: input.message
  };
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}

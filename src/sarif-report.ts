import {
  getDiagnosticFingerprint,
  type Diagnostic,
  type ValidationResult
} from './diagnostics.ts';

const SARIF_SCHEMA_URI = 'https://json.schemastore.org/sarif-2.1.0.json';
const TOOL_INFORMATION_URI =
  'https://github.com/0disoft/zdp-architecture-linter';
const DEFAULT_RULE_HELP_URI = [
  'https://github.com/0disoft/zdp-architecture-linter/blob/main',
  'docs/architecture/01-rule-source-map.md'
].join('/');

export interface SarifLog {
  readonly $schema: typeof SARIF_SCHEMA_URI;
  readonly version: '2.1.0';
  readonly runs: readonly SarifRun[];
}

interface SarifRun {
  readonly tool: {
    readonly driver: {
      readonly name: 'zdp-architecture-linter';
      readonly informationUri: typeof TOOL_INFORMATION_URI;
      readonly rules: readonly SarifRule[];
    };
  };
  readonly results: readonly SarifResult[];
}

interface SarifRule {
  readonly id: string;
  readonly name: string;
  readonly shortDescription: {
    readonly text: string;
  };
  readonly helpUri: string;
  readonly help?: {
    readonly text: string;
  };
  readonly properties?: {
    readonly sourceProofs: readonly string[];
  };
}

interface SarifResult {
  readonly ruleId: string;
  readonly ruleIndex: number;
  readonly level: 'error' | 'warning';
  readonly message: {
    readonly text: string;
  };
  readonly locations: readonly [
    {
      readonly physicalLocation: {
        readonly artifactLocation: {
          readonly uri: string;
        };
      };
      readonly logicalLocations: readonly [
        {
          readonly fullyQualifiedName: string;
          readonly kind: 'architecture-path';
        }
      ];
    }
  ];
  readonly partialFingerprints: {
    readonly primaryLocationLineHash: string;
    readonly 'zdpDiagnostic/v1': string;
  };
  readonly properties: {
    readonly zdpPath: string;
    readonly zdpFingerprint: string;
    readonly sourceProof?: string;
  };
}

export function createSarifReport(validation: ValidationResult): SarifLog {
  const diagnosticsByRule = groupDiagnosticsByRule(validation.diagnostics);
  const ruleIds = [...diagnosticsByRule.keys()].sort();
  const ruleIndexes = new Map(
    ruleIds.map((ruleId, index) => [ruleId, index] as const)
  );

  return {
    $schema: SARIF_SCHEMA_URI,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'zdp-architecture-linter',
            informationUri: TOOL_INFORMATION_URI,
            rules: ruleIds.map((ruleId) =>
              createSarifRule(ruleId, diagnosticsByRule.get(ruleId) ?? [])
            )
          }
        },
        results: validation.diagnostics.map((diagnostic) =>
          createSarifResult(diagnostic, ruleIndexes.get(diagnostic.ruleId) ?? 0)
        )
      }
    ]
  };
}

function createSarifRule(
  ruleId: string,
  diagnostics: readonly Diagnostic[]
): SarifRule {
  const sourceProofs = [
    ...new Set(
      diagnostics.flatMap((diagnostic) => {
        const sourceProof = toSafeSourceProof(diagnostic.sourceProof);
        return sourceProof === undefined ? [] : [sourceProof];
      })
    )
  ].sort();
  const helpUri =
    diagnostics
      .map((diagnostic) => toSafeHelpUri(diagnostic.helpUri))
      .find((value): value is string => value !== undefined) ??
    DEFAULT_RULE_HELP_URI;

  return {
    id: ruleId,
    name: ruleId,
    shortDescription: {
      text: `ZDP architecture rule ${ruleId}`
    },
    helpUri,
    ...(sourceProofs.length === 0
      ? {}
      : {
          help: {
            text: `Source proof:\n${sourceProofs.map((source) => `- ${source}`).join('\n')}`
          },
          properties: {
            sourceProofs
          }
        })
  };
}

function createSarifResult(
  diagnostic: Diagnostic,
  ruleIndex: number
): SarifResult {
  const fingerprint = getDiagnosticFingerprint(diagnostic);
  const sourceProof = toSafeSourceProof(diagnostic.sourceProof);

  return {
    ruleId: diagnostic.ruleId,
    ruleIndex,
    level: diagnostic.severity,
    message: {
      text: diagnostic.message
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: toArtifactUri(diagnostic.file)
          }
        },
        logicalLocations: [
          {
            fullyQualifiedName: diagnostic.path,
            kind: 'architecture-path'
          }
        ]
      }
    ],
    partialFingerprints: {
      primaryLocationLineHash: `${fingerprint}:1`,
      'zdpDiagnostic/v1': fingerprint
    },
    properties: {
      zdpPath: diagnostic.path,
      zdpFingerprint: fingerprint,
      ...(sourceProof === undefined || sourceProof.length === 0
        ? {}
        : { sourceProof })
    }
  };
}

function groupDiagnosticsByRule(
  diagnostics: readonly Diagnostic[]
): Map<string, readonly Diagnostic[]> {
  const grouped = new Map<string, Diagnostic[]>();

  for (const diagnostic of diagnostics) {
    const group = grouped.get(diagnostic.ruleId);

    if (group === undefined) {
      grouped.set(diagnostic.ruleId, [diagnostic]);
    } else {
      group.push(diagnostic);
    }
  }

  return grouped;
}

function toArtifactUri(file: string): string {
  const normalized = file.trim().replaceAll('\\', '/').replace(/^\.\/+/, '');
  const segments = normalized.split('/');

  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.some((segment) => segment === '..')
  ) {
    return 'unknown';
  }

  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function toSafeSourceProof(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (
    normalized === undefined ||
    normalized.length === 0 ||
    normalized.length > 256 ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(normalized) ||
    normalized.split(/[\\/]/).some((segment) => segment === '..') ||
    !/^[A-Za-z0-9._*/?\-]+(?:#[A-Za-z0-9._/\-]+)?$/.test(normalized)
  ) {
    return undefined;
  }
  return normalized.replaceAll('\\', '/');
}

function toSafeHelpUri(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0 || normalized.length > 512) {
    return undefined;
  }
  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.search === ''
      ? normalized
      : undefined;
  } catch {
    return undefined;
  }
}

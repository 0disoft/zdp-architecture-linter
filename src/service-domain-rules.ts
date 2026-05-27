import type { Diagnostic } from './diagnostics.ts';

const SERVICE_CONTRACT_FILE = 'service.yaml';
const DOMAIN_CONTRACT_RULE_ID = 'ZDP-DOMAIN-001';

export function validateRepositoryServiceDomainContract(
  value: unknown
): readonly Diagnostic[] {
  if (!isRecord(value) || !isRecord(value.runtime)) {
    return [];
  }

  const runtime = value.runtime;
  const diagnostics: Diagnostic[] = [];
  const domainStatus = readStringField(runtime, 'domain_status');
  const publicDomains = readStringArrayField(runtime, 'public_domains');
  const candidateDomains = readStringArrayField(
    runtime,
    'candidate_public_domains'
  );
  const canonicalDomain = readStringField(runtime, 'canonical_domain');

  if (domainStatus === 'candidate') {
    if (publicDomains.length > 0) {
      diagnostics.push(
        createDomainDiagnostic(
          'runtime.public_domains',
          'Candidate domain service contracts must keep `runtime.public_domains` empty until the domain is owned and routed.'
        )
      );
    }

    if (canonicalDomain !== null) {
      diagnostics.push(
        createDomainDiagnostic(
          'runtime.canonical_domain',
          'Candidate domain service contracts must not set `runtime.canonical_domain` before the canonical domain is owned and routed.'
        )
      );
    }
  }

  for (const [candidateIndex, domain] of candidateDomains.entries()) {
    const publicIndex = publicDomains.indexOf(domain);

    if (publicIndex !== -1) {
      diagnostics.push(
        createDomainDiagnostic(
          `runtime.candidate_public_domains[${candidateIndex}]`,
          `Domain \`${domain}\` must not appear in both \`runtime.candidate_public_domains[${candidateIndex}]\` and \`runtime.public_domains[${publicIndex}]\`.`
        )
      );
    }
  }

  if (domainStatus === 'live' && canonicalDomain === null) {
    diagnostics.push(
      createDomainDiagnostic(
        'runtime.canonical_domain',
        '`runtime.domain_status: live` requires `runtime.canonical_domain`.'
      )
    );
  }

  return diagnostics;
}

function readStringArrayField(
  value: Record<string, unknown>,
  field: string
): readonly string[] {
  const candidate = value[field];

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readStringField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createDomainDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: DOMAIN_CONTRACT_RULE_ID,
    severity: 'error',
    file: SERVICE_CONTRACT_FILE,
    path,
    message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { describe, expect, test } from 'bun:test';
import { validateRepositoryServiceDomainContract } from '../src/rules/index.ts';

describe('repository service contract domain rules', () => {
  test('passes for candidate domains that are not public yet', () => {
    const diagnostics = validateRepositoryServiceDomainContract({
      runtime: {
        public_domains: [],
        candidate_public_domains: ['8ailors.xyz'],
        canonical_domain: null,
        domain_status: 'candidate'
      }
    });

    expect(diagnostics).toEqual([]);
  });

  test('fails when a candidate domain contract declares public or canonical domains', () => {
    const diagnostics = validateRepositoryServiceDomainContract({
      runtime: {
        public_domains: ['8ailors.xyz'],
        candidate_public_domains: ['8ailors.xyz'],
        canonical_domain: '8ailors.xyz',
        domain_status: 'candidate'
      }
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DOMAIN-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'runtime.public_domains',
        message:
          'Candidate domain service contracts must keep `runtime.public_domains` empty until the domain is owned and routed.'
      },
      {
        ruleId: 'ZDP-DOMAIN-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'runtime.canonical_domain',
        message:
          'Candidate domain service contracts must not set `runtime.canonical_domain` before the canonical domain is owned and routed.'
      },
      {
        ruleId: 'ZDP-DOMAIN-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'runtime.candidate_public_domains[0]',
        message:
          'Domain `8ailors.xyz` must not appear in both `runtime.candidate_public_domains[0]` and `runtime.public_domains[0]`.'
      }
    ]);
  });

  test('fails when a live domain contract does not declare a canonical domain', () => {
    const diagnostics = validateRepositoryServiceDomainContract({
      runtime: {
        public_domains: ['8ailors.xyz'],
        candidate_public_domains: [],
        canonical_domain: null,
        domain_status: 'live'
      }
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DOMAIN-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'runtime.canonical_domain',
        message:
          '`runtime.domain_status: live` requires `runtime.canonical_domain`.'
      }
    ]);
  });

  test('passes for live domains with a canonical domain', () => {
    const diagnostics = validateRepositoryServiceDomainContract({
      runtime: {
        public_domains: ['8ailors.xyz'],
        candidate_public_domains: [],
        canonical_domain: '8ailors.xyz',
        domain_status: 'live'
      }
    });

    expect(diagnostics).toEqual([]);
  });
});

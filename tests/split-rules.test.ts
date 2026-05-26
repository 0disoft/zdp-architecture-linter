import { describe, expect, test } from 'bun:test';
import { buildRepositoryIndex } from '../src/repository-rules.ts';
import {
  validateRepositorySplitCandidates,
  validateSplitTriggerCatalog
} from '../src/split-rules.ts';

describe('split trigger catalog', () => {
  test('passes when future repos are registered and no split trigger is met', () => {
    const diagnostics = validateSplitTriggerCatalog(
      {
        split_triggers: [
          {
            domain: 'identity',
            current_location: 'zdp-core-platform/crates/identity',
            future_repo: 'zdp-core-identity',
            split_when: [
              'login traffic becomes independently scalable',
              'security audit requires isolated deployment'
            ]
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          {
            name: 'zdp-core-identity',
            repo_stage: 'logical_only',
            kind: 'logical_boundary',
            area: 'core'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('warns when a future repo is not registered', () => {
    const diagnostics = validateSplitTriggerCatalog(
      {
        split_triggers: [
          {
            domain: 'web_docs',
            current_location: 'zdp-web-public/apps/docs',
            future_repo: 'zdp-web-docs',
            split_when: ['separate deployment cycle needed']
          }
        ]
      },
      buildRepositoryIndex({ repositories: [] })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-SPLIT-001',
        severity: 'warning',
        file: 'catalogs/split-triggers.yaml',
        path: 'split_triggers[0:web_docs].future_repo',
        message:
          'Split trigger future repo `zdp-web-docs` should be registered in repositories.yaml before it is used as a split target.'
      }
    ]);
  });

  test('warns when a split target has enough met triggers for review', () => {
    const diagnostics = validateSplitTriggerCatalog(
      {
        split_triggers: [
          {
            domain: 'ledger',
            current_location: 'zdp-money-platform/crates/ledger',
            future_repo: 'zdp-money-ledger',
            met_count: 2,
            split_when: [
              'real revenue ledger is active',
              'separate DB permissions are required'
            ]
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          {
            name: 'zdp-money-ledger',
            repo_stage: 'logical_only',
            kind: 'logical_boundary',
            area: 'money'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-SPLIT-001',
        severity: 'warning',
        file: 'catalogs/split-triggers.yaml',
        path: 'split_triggers[0:ledger].split_trigger_met_count',
        message:
          'Split candidate `zdp-money-ledger` has 2 met split triggers and should be reviewed as an independent repository candidate.'
      }
    ]);
  });
});

describe('repository split candidates', () => {
  test('warns when a logical boundary has enough met split triggers', () => {
    const diagnostics = validateRepositorySplitCandidates({
      repositories: [
        {
          name: 'zdp-ai-gateway',
          status: 'reserved',
          repo_stage: 'logical_only',
          kind: 'logical_boundary',
          area: 'ai',
          purpose: 'AI gateway boundary.',
          owner: '0disoft',
          risk_level: 'high',
          current_location: 'zdp-ai-platform/components/gateway',
          split_trigger: [
            'multiple products route models',
            'quota and budget enforcement is business-critical'
          ],
          met_split_triggers: [
            'multiple products route models',
            'quota and budget enforcement is business-critical'
          ]
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-SPLIT-001',
        severity: 'warning',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-ai-gateway].split_trigger_met_count',
        message:
          'Split candidate `zdp-ai-gateway` has 2 met split triggers and should be reviewed as an independent repository candidate.'
      }
    ]);
  });

  test('also warns when a met repository split candidate omits current_location', () => {
    const diagnostics = validateRepositorySplitCandidates({
      repositories: [
        {
          name: 'zdp-core-identity',
          status: 'reserved',
          repo_stage: 'logical_only',
          kind: 'logical_boundary',
          area: 'core',
          purpose: 'Identity boundary.',
          owner: '0disoft',
          risk_level: 'high',
          split_trigger: [
            'login traffic becomes independently scalable',
            'security audit requires isolated deployment'
          ],
          split_trigger_met_count: 2
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-SPLIT-001',
        severity: 'warning',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-core-identity].split_trigger_met_count',
        message:
          'Split candidate `zdp-core-identity` has 2 met split triggers and should be reviewed as an independent repository candidate.'
      },
      {
        ruleId: 'ZDP-SPLIT-001',
        severity: 'warning',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-core-identity].current_location',
        message:
          'Split candidate `zdp-core-identity` should declare its current integrated location before repository promotion.'
      }
    ]);
  });
});

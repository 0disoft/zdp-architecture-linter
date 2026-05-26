import { describe, expect, test } from 'bun:test';
import {
  buildRepositoryAreaRules,
  buildRepositoryPolicyNoteRules,
  validateRepositoriesCatalog
} from '../src/repository-rules.ts';

const repositoryAreaRules = buildRepositoryAreaRules({
  repository_area_rules: {
    exact: {
      'zdp-api-contracts': 'architecture'
    },
    prefixes: [
      { prefix: 'zdp-core-', area: 'core' },
      { prefix: 'zdp-web-', area: 'frontend' },
      { prefix: 'zdp-client-', area: 'frontend' }
    ]
  }
});

const repositoryPolicyNoteRules = buildRepositoryPolicyNoteRules({
  repository_note_machine_field_rules: [
    {
      target_field: 'create_after',
      note_patterns: ['안정화된 뒤']
    },
    {
      target_field: 'create_when',
      note_patterns: ['증거가 생기면', '완성되기 전까지']
    },
    {
      target_field: 'forbidden',
      note_patterns: ['직접 처리하지 않는다', '금지']
    }
  ]
});

describe('repository catalog required fields', () => {
  test('passes when a repository entry has the required baseline fields', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        {
          name: 'zdp-architecture-linter',
          status: 'active',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit',
          area: 'architecture',
          purpose: 'Validate ZDP architecture contracts.',
          owner: '0disoft',
          risk_level: 'high'
        }
      ]
    });

    expect(diagnostics).toEqual([]);
  });

  test('fails with stable field paths when required fields are missing', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        {
          name: 'zdp-platform-runtime',
          status: 'reserved',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit',
          area: 'platform',
          purpose: 'Runtime baseline.'
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-001',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-platform-runtime].owner',
        message: 'Repository entry is missing required field `owner`.'
      },
      {
        ruleId: 'ZDP-REPO-001',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-platform-runtime].risk_level',
        message: 'Repository entry is missing required field `risk_level`.'
      }
    ]);
  });
});

describe('repository area prefix compatibility', () => {
  test('passes when repository area matches the prefix rules', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
        repositories: [
          {
            name: 'zdp-web-public',
            status: 'reserved',
            repo_stage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'frontend',
            purpose: 'Public web surface.',
            owner: '0disoft',
            risk_level: 'low'
          },
          {
            name: 'zdp-api-contracts',
            status: 'reserved',
            repo_stage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'architecture',
            purpose: 'API and event contracts.',
            owner: '0disoft',
            risk_level: 'medium'
          }
        ]
      },
      repositoryAreaRules
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when repository area conflicts with the prefix rules', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
        repositories: [
          {
            name: 'zdp-core-access',
            status: 'reserved',
            repo_stage: 'logical_only',
            kind: 'logical_boundary',
            area: 'frontend',
            purpose: 'Access control boundary.',
            owner: '0disoft',
            risk_level: 'high'
          }
        ]
      },
      repositoryAreaRules
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-003',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-core-access].area',
        message:
          'Repository name `zdp-core-access` maps to area `core`, but catalog area is `frontend`.'
      }
    ]);
  });

  test('fails when repository name has no allowed area rule', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
        repositories: [
          {
            name: 'zdp-unknown-thing',
            status: 'reserved',
            repo_stage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'platform',
            purpose: 'Unknown boundary.',
            owner: '0disoft',
            risk_level: 'medium'
          }
        ]
      },
      repositoryAreaRules
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-003',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-unknown-thing].name',
        message:
          'Repository name `zdp-unknown-thing` does not match any allowed area prefix rule.'
      }
    ]);
  });
});

describe('conditional repository split triggers', () => {
  test('warns when a conditional deploy unit omits create_when evidence', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        {
          name: 'zdp-mobile-flutter',
          status: 'reserved',
          repo_stage: 'conditional_deploy_unit',
          kind: 'deploy_unit',
          area: 'mobile',
          purpose: 'Mobile app shell.',
          owner: '0disoft',
          risk_level: 'medium'
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-WARN-001',
        severity: 'warning',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-mobile-flutter].create_when',
        message:
          'Repository with repo_stage `conditional_deploy_unit` should declare `create_when` evidence.'
      }
    ]);
  });

  test('passes when a conditional deploy unit declares create_when evidence', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        {
          name: 'zdp-desktop-tauri',
          status: 'reserved',
          repo_stage: 'conditional_deploy_unit',
          kind: 'deploy_unit',
          area: 'desktop',
          purpose: 'Desktop app shell.',
          owner: '0disoft',
          risk_level: 'medium',
          create_when: [
            'A product needs native desktop integration beyond a web app.'
          ]
        }
      ]
    });

    expect(diagnostics).toEqual([]);
  });
});

describe('reserved deploy unit roadmap evidence', () => {
  test('warns when a reserved deploy unit is missing from roadmap evidence', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
        repositories: [
          {
            name: 'zdp-admin-console',
            status: 'reserved',
            repo_stage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'admin',
            purpose: 'Admin console.',
            owner: '0disoft',
            risk_level: 'high'
          }
        ]
      },
      undefined,
      { text: 'zdp-architecture-linter\nzdp-platform-infra\n' }
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-WARN-002',
        severity: 'warning',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-admin-console].name',
        message:
          'Reserved deploy unit `zdp-admin-console` should appear in ROADMAP.md or docs/26-eighteen-month-roadmap.md.'
      }
    ]);
  });

  test('passes when a reserved deploy unit appears in roadmap evidence', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
        repositories: [
          {
            name: 'zdp-platform-infra',
            status: 'reserved',
            repo_stage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'platform',
            purpose: 'Infrastructure baseline.',
            owner: '0disoft',
            risk_level: 'high'
          }
        ]
      },
      undefined,
      { text: '0~30 days: zdp-platform-infra\n' }
    );

    expect(diagnostics).toEqual([]);
  });
});

describe('repository notes machine fields', () => {
  test('warns when latest-review policy stays only in notes', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        {
          name: 'zdp-money-platform',
          status: 'reserved',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit',
          area: 'money',
          purpose: 'Money platform.',
          owner: '0disoft',
          risk_level: 'high',
          notes: [
            '실제 PSP, MoR, 암호화폐 수수료와 정책은 구현 전 최신 공식 문서 확인이 필요하다.'
          ]
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-NOTES-WARN-001',
        severity: 'warning',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-money-platform].requires_latest_review',
        message:
          'Repository notes require a latest external review marker; set `requires_latest_review: true`.'
      }
    ]);
  });

  test('passes when latest-review policy is also a machine field', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        {
          name: 'zdp-labs-prasso',
          status: 'reserved',
          repo_stage: 'lab_only',
          kind: 'lab',
          area: 'labs',
          purpose: 'Prasso lab.',
          owner: '0disoft',
          risk_level: 'low',
          requires_latest_review: true,
          notes: [
            'Go 프레임워크와 표준 라이브러리 상태는 구현 전 최신 공식 문서 확인이 필요하다.'
          ]
        }
      ]
    });

    expect(diagnostics).toEqual([]);
  });

  test('ignores descriptive notes without latest-review policy language', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        {
          name: 'zdp-core-platform',
          status: 'reserved',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit',
          area: 'core',
          purpose: 'Core platform.',
          owner: '0disoft',
          risk_level: 'high',
          notes: [
            '논리 경계는 분리해 설계하되 초기 실제 배포 단위는 작게 유지한다.'
          ]
        }
      ]
    });

    expect(diagnostics).toEqual([]);
  });

  test('warns when policy notes have no matching machine field', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
        repositories: [
          {
            name: 'zdp-api-contracts',
            status: 'reserved',
            repo_stage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'architecture',
            purpose: 'API contracts.',
            owner: '0disoft',
            risk_level: 'medium',
            notes: ['zdp-architecture-linter가 안정화된 뒤 생성한다.']
          }
        ]
      },
      undefined,
      undefined,
      repositoryPolicyNoteRules
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-NOTES-WARN-002',
        severity: 'warning',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-api-contracts].create_after',
        message:
          'Repository notes contain policy text that should be moved to machine field `create_after`: zdp-architecture-linter가 안정화된 뒤 생성한다.'
      }
    ]);
  });

  test('passes when policy notes have matching machine fields', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
        repositories: [
          {
            name: 'zdp-data-platform',
            status: 'reserved',
            repo_stage: 'later_candidate',
            kind: 'candidate',
            area: 'data',
            purpose: 'Data platform.',
            owner: '0disoft',
            risk_level: 'medium',
            create_when: ['PostgreSQL과 로그만으로 부족하다는 증거가 생긴다.'],
            notes: ['PostgreSQL과 로그만으로 부족하다는 증거가 생기면 독립 배포 단위로 승격한다.']
          },
          {
            name: 'zdp-money-platform',
            status: 'reserved',
            repo_stage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'money',
            purpose: 'Money platform.',
            owner: '0disoft',
            risk_level: 'high',
            forbidden: ['제품 저장소에서 결제·원장·크레딧을 직접 처리하지 않는다.'],
            notes: ['결제·원장·크레딧·환불·차지백은 제품 저장소에서 직접 처리하지 않는다.']
          }
        ]
      },
      undefined,
      undefined,
      repositoryPolicyNoteRules
    );

    expect(diagnostics).toEqual([]);
  });
});

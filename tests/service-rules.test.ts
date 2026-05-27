import { describe, expect, test } from 'bun:test';
import { buildRepositoryIndex, validateRepositoriesCatalog } from '../src/repository-rules.ts';
import {
  buildServiceIndex,
  validateRepositoryServiceContractRepositoryReference,
  validateRepositoryServiceContractServiceCatalogReference,
  validateServiceDependencyReferences,
  validateServiceRepositoryReferences
} from '../src/service-rules.ts';

describe('service repository references', () => {
  test('passes when services reference deployable repositories', () => {
    const repositories = {
      repositories: [
        createRepository({
          name: 'zdp-core-platform',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit'
        })
      ]
    };

    const diagnostics = validateServiceRepositoryReferences(
      {
        services: [
          {
            id: 'core-api',
            repo: 'zdp-core-platform'
          }
        ]
      },
      buildRepositoryIndex(repositories)
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a service references an unknown repository', () => {
    const repositories = {
      repositories: [
        createRepository({
          name: 'zdp-core-platform',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit'
        })
      ]
    };

    const diagnostics = validateServiceRepositoryReferences(
      {
        services: [
          {
            id: 'ghost-api',
            repo: 'zdp-ghost-platform'
          }
        ]
      },
      buildRepositoryIndex(repositories)
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ghost-api].repo',
        message: 'Service references unknown repository `zdp-ghost-platform`.'
      }
    ]);
  });

  test('fails when a service is owned by a non-deployable repository stage', () => {
    const repositories = {
      repositories: [
        createRepository({
          name: 'zdp-ai-memory',
          repo_stage: 'logical_only',
          kind: 'logical_boundary'
        })
      ]
    };

    const diagnostics = validateServiceRepositoryReferences(
      {
        services: [
          {
            id: 'ai-memory',
            repo: 'zdp-ai-memory'
          }
        ]
      },
      buildRepositoryIndex(repositories)
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-memory].repo',
        message:
          'Service must not be owned by `zdp-ai-memory` because its repo_stage is `logical_only`.'
      }
    ]);
  });

  test('passes when a service is owned by a lab-only lab repository', () => {
    const repositories = {
      repositories: [
        createRepository({
          name: 'zdp-labs-jiffy',
          repo_stage: 'lab_only',
          kind: 'lab'
        })
      ]
    };

    const diagnostics = validateServiceRepositoryReferences(
      {
        services: [
          {
            id: 'jiffy-runtime-lab',
            repo: 'zdp-labs-jiffy'
          }
        ]
      },
      buildRepositoryIndex(repositories)
    );

    expect(diagnostics).toEqual([]);
  });
});

describe('repository service contract repository references', () => {
  test('passes when service.yaml references a deployable repository', () => {
    const repositories = {
      repositories: [
        createRepository({
          name: 'zdp-architecture-linter',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit'
        })
      ]
    };

    const diagnostics = validateRepositoryServiceContractRepositoryReference(
      {
        service: {
          id: 'architecture-linter-cli',
          repo: 'zdp-architecture-linter'
        }
      },
      buildRepositoryIndex(repositories)
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when service.yaml references an unknown repository', () => {
    const diagnostics = validateRepositoryServiceContractRepositoryReference(
      {
        service: {
          id: 'ghost-cli',
          repo: 'zdp-ghost-platform'
        }
      },
      buildRepositoryIndex({ repositories: [] })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.repo',
        message:
          'Service contract references unknown repository `zdp-ghost-platform`.'
      }
    ]);
  });

  test('fails when service.yaml references a non-deployable repository stage', () => {
    const repositories = {
      repositories: [
        createRepository({
          name: 'zdp-ai-memory',
          repo_stage: 'logical_only',
          kind: 'logical_boundary'
        })
      ]
    };

    const diagnostics = validateRepositoryServiceContractRepositoryReference(
      {
        service: {
          id: 'ai-memory',
          repo: 'zdp-ai-memory'
        }
      },
      buildRepositoryIndex(repositories)
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-002',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.repo',
        message:
          'Service contract must not be owned by `zdp-ai-memory` because its repo_stage is `logical_only`.'
      }
    ]);
  });

  test('passes when service.yaml references a lab-only lab repository', () => {
    const repositories = {
      repositories: [
        createRepository({
          name: 'zdp-labs-jiffy',
          repo_stage: 'lab_only',
          kind: 'lab'
        })
      ]
    };

    const diagnostics = validateRepositoryServiceContractRepositoryReference(
      {
        service: {
          id: 'jiffy-runtime-lab',
          repo: 'zdp-labs-jiffy'
        }
      },
      buildRepositoryIndex(repositories)
    );

    expect(diagnostics).toEqual([]);
  });
});

describe('repository service contract service catalog references', () => {
  test('passes when service.yaml is registered in services.yaml with the same repo', () => {
    const services = {
      services: [
        {
          id: 'architecture-linter',
          repo: 'zdp-architecture-linter'
        }
      ]
    };

    const diagnostics = validateRepositoryServiceContractServiceCatalogReference(
      {
        service: {
          id: 'architecture-linter',
          repo: 'zdp-architecture-linter'
        }
      },
      buildServiceIndex(services)
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when service.yaml is not registered in services.yaml', () => {
    const diagnostics = validateRepositoryServiceContractServiceCatalogReference(
      {
        service: {
          id: 'ghost-service',
          repo: 'zdp-architecture-linter'
        }
      },
      buildServiceIndex({ services: [] })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-009',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.id',
        message:
          'Service contract id `ghost-service` is not registered in `catalogs/services.yaml`.'
      }
    ]);
  });

  test('fails when service.yaml repo differs from services.yaml repo', () => {
    const services = {
      services: [
        {
          id: 'architecture-linter',
          repo: 'zdp-architecture-linter'
        }
      ]
    };

    const diagnostics = validateRepositoryServiceContractServiceCatalogReference(
      {
        service: {
          id: 'architecture-linter',
          repo: 'zdp-core-platform'
        }
      },
      buildServiceIndex(services)
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-009',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.repo',
        message:
          'Service contract repo `zdp-core-platform` does not match `catalogs/services.yaml` repo `zdp-architecture-linter` for service `architecture-linter`.'
      }
    ]);
  });
});

describe('service dependency references', () => {
  test('passes when dependencies reference known services', () => {
    const services = {
      services: [
        {
          id: 'app-console',
          dependencies: ['core-api']
        },
        {
          id: 'core-api'
        }
      ]
    };

    const diagnostics = validateServiceDependencyReferences(
      services,
      buildServiceIndex(services)
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when dependencies reference unknown services', () => {
    const services = {
      services: [
        {
          id: 'app-console',
          dependencies: ['ghost-api']
        },
        {
          id: 'core-api'
        }
      ]
    };

    const diagnostics = validateServiceDependencyReferences(
      services,
      buildServiceIndex(services)
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:app-console].dependencies[0]',
        message: 'Service references unknown dependency service `ghost-api`.'
      }
    ]);
  });

  test('fails when dependencies is not an array', () => {
    const services = {
      services: [
        {
          id: 'app-console',
          dependencies: 'core-api'
        },
        {
          id: 'core-api'
        }
      ]
    };

    const diagnostics = validateServiceDependencyReferences(
      services,
      buildServiceIndex(services)
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:app-console].dependencies',
        message: '`dependencies` must be a YAML array when present.'
      }
    ]);
  });
});

describe('repository stage and kind compatibility', () => {
  test('fails when a non-deployable repository is marked as a deploy unit', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        createRepository({
          name: 'zdp-ai-memory',
          repo_stage: 'logical_only',
          kind: 'deploy_unit'
        })
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-002',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-ai-memory].kind',
        message:
          'Repository with repo_stage `logical_only` must not be kind `deploy_unit`.'
      }
    ]);
  });

  test('fails when repo_stage is malformed even if kind is deploy_unit', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        createRepository({
          name: 'zdp-ai-memory',
          repo_stage: ['logical_only'],
          kind: 'deploy_unit'
        })
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-001',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-ai-memory].repo_stage',
        message: 'Repository entry is missing required field `repo_stage`.'
      }
    ]);
  });
});

function createRepository(
  overrides: Partial<Record<string, unknown>>
): Record<string, unknown> {
  return {
    name: 'zdp-example',
    status: 'reserved',
    repo_stage: 'deploy_unit',
    kind: 'deploy_unit',
    area: 'core',
    purpose: 'Example repository.',
    owner: '0disoft',
    risk_level: 'medium',
    ...overrides
  };
}

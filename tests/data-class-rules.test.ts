import { describe, expect, test } from 'bun:test';
import {
  buildDataClassIndex,
  buildServiceDataCatalogPolicy,
  buildServiceDataOwnershipPolicy,
  validateDataClassAllowedDatastoreReferences,
  validateDataClassDatastoreReciprocity,
  validateDataClassCatalog,
  validateDatastoreDataClassReferences,
  validateServiceDataCatalogReferences,
  validateServiceDataOwnershipContracts
} from '../src/data-class-rules.ts';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';

const serviceDataCatalogPolicy = buildServiceDataCatalogPolicy({
  rules: [
    {
      id: 'ZDP-DATA-003',
      assertions: {
        require_catalog_refs: {
          'data.classes': 'catalogs/data-classes.yaml:data_classes[].id',
          'data.datastores': 'catalogs/datastores.yaml:datastores[].id'
        }
      }
    }
  ]
});

const serviceDataOwnershipPolicy = buildServiceDataOwnershipPolicy({
  rules: [
    {
      id: 'ZDP-DATA-005',
      assertions: {
        require_fields: ['data.owner_domain', 'data.datastores']
      }
    },
    {
      id: 'ZDP-DATA-006',
      assertions: {
        require_fields: [
          'data.owner_domain',
          'data.datastores',
          'data.deletion.required',
          'data.deletion.targets',
          'data.deletion.evidence_required',
          'audit.required',
          'audit.events',
          'audit.reason_required_for_admin_access',
          'human_review_required'
        ]
      }
    }
  ]
});

describe('service data catalog references', () => {
  test('passes when service data classes and datastores exist in catalogs', () => {
    const diagnostics = validateServiceDataCatalogReferences(
      {
        services: [
          {
            id: 'core-api',
            data: {
              classes: ['identity'],
              datastores: ['core_postgres']
            }
          }
        ]
      },
      serviceDataCatalogPolicy,
      buildDataClassIndex({
        data_classes: [{ id: 'identity' }]
      }),
      buildDatastoreIndex({
        datastores: [{ id: 'core_postgres', owner_repo: 'zdp-core-platform' }]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when service data fields are absent', () => {
    const diagnostics = validateServiceDataCatalogReferences(
      {
        services: [
          {
            id: 'public-web'
          }
        ]
      },
      serviceDataCatalogPolicy,
      buildDataClassIndex({ data_classes: [] }),
      buildDatastoreIndex({ datastores: [] })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when service data catalog references are unknown', () => {
    const diagnostics = validateServiceDataCatalogReferences(
      {
        services: [
          {
            id: 'core-api',
            data: {
              classes: ['identity', 'ghost-class'],
              datastores: ['core_postgres', 'ghost_postgres']
            }
          }
        ]
      },
      serviceDataCatalogPolicy,
      buildDataClassIndex({
        data_classes: [{ id: 'identity' }]
      }),
      buildDatastoreIndex({
        datastores: [{ id: 'core_postgres', owner_repo: 'zdp-core-platform' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-003',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].data.classes[1]',
        message: 'Service references unknown data class `ghost-class`.'
      },
      {
        ruleId: 'ZDP-DATA-003',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].data.datastores[1]',
        message: 'Service references unknown datastore `ghost_postgres`.'
      }
    ]);
  });

  test('fails when service data references are not arrays', () => {
    const diagnostics = validateServiceDataCatalogReferences(
      {
        services: [
          {
            id: 'core-api',
            data: {
              classes: 'identity',
              datastores: 'core_postgres'
            }
          }
        ]
      },
      serviceDataCatalogPolicy,
      buildDataClassIndex({ data_classes: [{ id: 'identity' }] }),
      buildDatastoreIndex({
        datastores: [{ id: 'core_postgres', owner_repo: 'zdp-core-platform' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-003',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].data.classes',
        message: '`data.classes` must be a YAML array when present.'
      },
      {
        ruleId: 'ZDP-DATA-003',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].data.datastores',
        message: '`data.datastores` must be a YAML array when present.'
      }
    ]);
  });
});

describe('data class catalog', () => {
  test('passes when data classes have ids', () => {
    const diagnostics = validateDataClassCatalog({
      data_classes: [
        {
          id: 'identity',
          description: 'Accounts and sessions.'
        }
      ]
    });

    expect(diagnostics).toEqual([]);
  });

  test('fails when a data class id is missing', () => {
    const diagnostics = validateDataClassCatalog({
      data_classes: [
        {
          description: 'Accounts and sessions.'
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-006',
        severity: 'error',
        file: 'catalogs/data-classes.yaml',
        path: 'data_classes[0].id',
        message: 'Data class entry is missing required field `id`.'
      }
    ]);
  });
});

describe('service data ownership contracts', () => {
  test('passes when data classes include owner domain and datastores', () => {
    const diagnostics = validateServiceDataOwnershipContracts(
      {
        services: [
          {
            id: 'core-api',
            data: {
              classes: ['identity'],
              owner_domain: 'core',
              datastores: ['core_postgres']
            }
          }
        ]
      },
      serviceDataOwnershipPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when data classes are empty', () => {
    const diagnostics = validateServiceDataOwnershipContracts(
      {
        services: [
          {
            id: 'public-web',
            data: {
              classes: []
            }
          }
        ]
      },
      serviceDataOwnershipPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when data classes omit ownership fields', () => {
    const diagnostics = validateServiceDataOwnershipContracts(
      {
        services: [
          {
            id: 'core-api',
            data: {
              classes: ['identity'],
              owner_domain: '',
              datastores: []
            }
          }
        ]
      },
      serviceDataOwnershipPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-005',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].data.owner_domain',
        message:
          'Service `core-api` declares data classes and must set `data.owner_domain`.'
      },
      {
        ruleId: 'ZDP-DATA-005',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].data.datastores',
        message:
          'Service `core-api` declares data classes and must set `data.datastores`.'
      }
    ]);
  });

  test('passes when a product-local PII snapshot declares deletion, audit, and privacy review', () => {
    const diagnostics = validateServiceDataOwnershipContracts(
      {
        services: [
          {
            id: 'local-product',
            domain: { type: 'product' },
            data: {
              classes: ['local-inquiry'],
              owner_domain: 'local-product',
              datastores: ['local_postgres'],
              pii_level: 'high',
              deletion: {
                required: true,
                targets: ['local-inquiry'],
                evidence_required: true
              }
            },
            audit: {
              required: true,
              events: ['local.inquiry.sensitive-read'],
              reason_required_for_admin_access: true
            },
            human_review_required: ['privacy']
          }
        ]
      },
      serviceDataOwnershipPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails closed when a product-local PII snapshot omits privacy controls', () => {
    const diagnostics = validateServiceDataOwnershipContracts(
      {
        services: [
          {
            id: 'local-product',
            domain: { type: 'product' },
            data: {
              classes: ['local-inquiry'],
              owner_domain: 'local-product',
              datastores: ['local_postgres'],
              pii_level: 'high',
              deletion: { required: false, targets: [], evidence_required: false }
            },
            audit: { required: false, events: [], reason_required_for_admin_access: false },
            human_review_required: ['security']
          }
        ]
      },
      serviceDataOwnershipPolicy
    );

    expect(diagnostics.map(({ ruleId }) => ruleId).every((id) => id === 'ZDP-DATA-006')).toBe(true);
    expect(diagnostics.map(({ path }) => path)).toContain(
      'services[0:local-product].human_review_required'
    );
    expect(diagnostics).toHaveLength(6);
  });
});

describe('data class allowed datastore references', () => {
  test('passes when allowed datastores reference known datastores', () => {
    const diagnostics = validateDataClassAllowedDatastoreReferences(
      {
        data_classes: [
          {
            id: 'identity',
            allowed_datastores: ['core_postgres']
          }
        ]
      },
      buildDatastoreIndex({
        datastores: [{ id: 'core_postgres', owner_repo: 'zdp-core-platform' }]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when allowed datastores reference unknown datastores', () => {
    const diagnostics = validateDataClassAllowedDatastoreReferences(
      {
        data_classes: [
          {
            id: 'identity',
            allowed_datastores: ['ghost_postgres']
          }
        ]
      },
      buildDatastoreIndex({
        datastores: [{ id: 'core_postgres', owner_repo: 'zdp-core-platform' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-006',
        severity: 'error',
        file: 'catalogs/data-classes.yaml',
        path: 'data_classes[0:identity].allowed_datastores[0]',
        message:
          'Data class references unknown allowed datastore `ghost_postgres`.'
      }
    ]);
  });

  test('fails when allowed datastores is not an array', () => {
    const diagnostics = validateDataClassAllowedDatastoreReferences(
      {
        data_classes: [
          {
            id: 'identity',
            allowed_datastores: 'core_postgres'
          }
        ]
      },
      buildDatastoreIndex({
        datastores: [{ id: 'core_postgres', owner_repo: 'zdp-core-platform' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-006',
        severity: 'error',
        file: 'catalogs/data-classes.yaml',
        path: 'data_classes[0:identity].allowed_datastores',
        message: '`allowed_datastores` must be a YAML array when present.'
      }
    ]);
  });
});

describe('datastore data class references', () => {
  test('passes when datastore data classes reference known data classes', () => {
    const diagnostics = validateDatastoreDataClassReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            data_classes: ['identity']
          }
        ]
      },
      buildDataClassIndex({
        data_classes: [{ id: 'identity' }]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when datastore data classes reference unknown data classes', () => {
    const diagnostics = validateDatastoreDataClassReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            data_classes: ['pii']
          }
        ]
      },
      buildDataClassIndex({
        data_classes: [{ id: 'identity' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-006',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:core_postgres].data_classes[0]',
        message: 'Datastore references unknown data class `pii`.'
      }
    ]);
  });

  test('fails when datastore data classes is not an array', () => {
    const diagnostics = validateDatastoreDataClassReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            data_classes: 'identity'
          }
        ]
      },
      buildDataClassIndex({
        data_classes: [{ id: 'identity' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-006',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:core_postgres].data_classes',
        message: '`data_classes` must be a YAML array when present.'
      }
    ]);
  });
});

describe('data class and datastore reciprocity', () => {
  test('passes when both catalogs declare the same storage relation', () => {
    expect(
      validateDataClassDatastoreReciprocity(
        { data_classes: [{ id: 'audit-logs', allowed_datastores: ['audit_postgres'] }] },
        { datastores: [{ id: 'audit_postgres', data_classes: ['audit-logs'] }] }
      )
    ).toEqual([]);
  });

  test('reports each one-sided relation without duplicating unknown-reference errors', () => {
    const diagnostics = validateDataClassDatastoreReciprocity(
      {
        data_classes: [
          { id: 'audit-logs', allowed_datastores: ['admin_postgres', 'missing'] },
          { id: 'admin-action-request', allowed_datastores: [] }
        ]
      },
      {
        datastores: [
          { id: 'admin_postgres', data_classes: [] },
          { id: 'audit_postgres', data_classes: ['admin-action-request', 'missing'] }
        ]
      }
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-008',
        severity: 'error',
        file: 'catalogs/data-classes.yaml',
        path: 'data_classes[0:audit-logs].allowed_datastores[0]',
        message:
          'Data class `audit-logs` allows datastore `admin_postgres`, but that datastore does not list the data class.'
      },
      {
        ruleId: 'ZDP-DATA-008',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[1:audit_postgres].data_classes[0]',
        message:
          'Datastore `audit_postgres` stores data class `admin-action-request`, but that data class does not allow the datastore.'
      }
    ]);
  });
});

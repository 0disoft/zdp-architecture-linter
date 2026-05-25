import { describe, expect, test } from 'bun:test';
import {
  buildDataClassIndex,
  validateDataClassAllowedDatastoreReferences,
  validateDataClassCatalog,
  validateDatastoreDataClassReferences
} from '../src/data-class-rules.ts';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';

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

import { describe, expect, test } from 'bun:test';
import type { Diagnostic } from '../src/diagnostics.ts';
import {
  VALIDATION_RULE_REGISTRY,
  filterDiagnosticsForSelection,
  isValidationRuleSelected,
  resolveValidationRuleSelection,
  validationSelectionUsesInput
} from '../src/rule-registry.ts';

describe('validation rule registry', () => {
  test('keeps IDs unique and metadata complete', () => {
    const ids = VALIDATION_RULE_REGISTRY.map((metadata) => metadata.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(
      VALIDATION_RULE_REGISTRY.every(
        (metadata) =>
          metadata.sourceProof.length > 0 &&
          metadata.appliesTo.length > 0 &&
          metadata.inputs.length > 0 &&
          metadata.description.length > 0
      )
    ).toBe(true);
  });

  test('unions rule and group selectors while retaining schema preflight', () => {
    const selection = resolveValidationRuleSelection({
      ruleIds: ['catalog.repositories'],
      groups: ['fixture']
    });

    expect(selection).not.toBeNull();
    if (selection === null) {
      return;
    }

    expect(isValidationRuleSelected('catalog.schema-preflight', selection)).toBe(true);
    expect(isValidationRuleSelected('catalog.repositories', selection)).toBe(true);
    expect(isValidationRuleSelected('fixture.service-schema', selection)).toBe(true);
    expect(isValidationRuleSelected('service.api', selection)).toBe(false);
    expect(validationSelectionUsesInput(selection, 'repository-contract')).toBe(false);
  });

  test('uses default severity to skip single-severity validators', () => {
    const errorSelection = resolveValidationRuleSelection({
      severities: ['error']
    });
    const warningSelection = resolveValidationRuleSelection({
      severities: ['warning']
    });

    expect(errorSelection).not.toBeNull();
    expect(warningSelection).not.toBeNull();
    if (errorSelection === null || warningSelection === null) {
      return;
    }

    expect(
      isValidationRuleSelected('fixture.service-schema', errorSelection)
    ).toBe(true);
    expect(
      isValidationRuleSelected('fixture.service-schema', warningSelection)
    ).toBe(false);
    expect(isValidationRuleSelected('catalog.repositories', errorSelection)).toBe(
      true
    );
  });

  test('filters produced diagnostics by requested severity', () => {
    const selection = resolveValidationRuleSelection({
      severities: ['warning']
    });
    const diagnostics: readonly Diagnostic[] = [
      {
        ruleId: 'RULE-ERROR',
        severity: 'error',
        message: 'error',
        file: 'service.yaml',
        path: 'service.id'
      },
      {
        ruleId: 'RULE-WARNING',
        severity: 'warning',
        message: 'warning',
        file: 'service.yaml',
        path: 'service.owner'
      }
    ];

    expect(selection).not.toBeNull();
    if (selection === null) {
      return;
    }

    expect(filterDiagnosticsForSelection(diagnostics, selection)).toEqual([
      diagnostics[1]
    ]);
  });

  test('rejects unknown rules, groups, and severities', () => {
    expect(
      resolveValidationRuleSelection({ ruleIds: ['catalog.unknown'] })
    ).toBeNull();
    expect(resolveValidationRuleSelection({ groups: ['unknown'] })).toBeNull();
    expect(
      resolveValidationRuleSelection({ severities: ['info'] })
    ).toBeNull();
  });
});

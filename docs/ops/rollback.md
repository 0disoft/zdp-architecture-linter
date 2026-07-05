# Rollback

Status: Active

## Rollback goals

Rollback restores correct policy enforcement without hiding real ZDP contract drift. A rollback may narrow a wrong rule, revert a fixture, or restore CLI compatibility, but it must not turn a hard safety boundary into fake success.

## Decision tree

1. Wrong block against valid repository:
   - confirm source policy and fixture expectation;
   - narrow rule condition;
   - add pass regression for the valid case;
   - keep diagnostic ID if meaning is unchanged.
2. Missed violation:
   - add failing fixture first;
   - strengthen rule;
   - run focused or full test;
   - update docs/CHANGELOG if public behavior changes.
3. Broken CLI JSON:
   - restore parseable JSON shape;
   - add CLI regression;
   - preserve non-zero exit on failure.
4. Generated output stale:
   - use registry check/refresh intent;
   - do not hand-edit generated output as source.

## Compatibility rules

- Do not reuse an existing diagnostic ID for a different policy meaning.
- Do not remove a diagnostic without documenting why the policy source no longer requires it.
- Do not weaken money, privacy, credential, AI user data, public API error, or secret leakage gates without a source policy change.

## Validation

Rollback validation should match the broken surface:

- rule rollback: focused rules test or `zdp_architecture_linter_full_test`
- CLI rollback: full CLI-related test through `zdp_architecture_linter_full_test`
- repository contract rollback: `zdp_architecture_validate_architecture_linter_repository`
- central source drift: `zdp_architecture_validate_fast`

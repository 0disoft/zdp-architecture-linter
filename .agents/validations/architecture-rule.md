# Architecture Rule Validation

Status: Active

## Required evidence

- Policy source is named and current.
- Rule ID and severity are stable.
- Failure fixture or unit test proves the blocked condition.
- Passing case proves the rule does not overmatch a valid repository contract.
- README/CHANGELOG/docs are updated when public behavior changes.

## Mustflow intents

- `zdp_architecture_linter_typecheck`
- Focused rules test from `VALIDATION.md` when available
- `zdp_architecture_linter_full_test` for broad or cross-cutting rule changes
- `zdp_architecture_validate_fast` when central architecture source or generated registry may drift

## Skipped checks

Skipped validation must name the missing configured intent or explain why the changed surface is documentation-only.

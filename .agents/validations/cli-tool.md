# CLI Tool Validation

Status: Active

## Required evidence

- CLI parser and help text still agree with documented command names.
- JSON output remains parseable and redacted.
- Failure mode returns non-zero exit status and machine-readable error when `--json` is selected.
- New or changed command behavior has unit or CLI tests.

## Mustflow intents

- `zdp_architecture_linter_typecheck`
- `zdp_architecture_linter_full_test` when output or parser behavior changes
- `zdp_architecture_validate_architecture_linter_repository` when repository root contract changes

## Skipped checks

If full test is skipped, report why the changed command cannot affect parser, output shape, diagnostics, fixture behavior, or source loading.

---
name: cli-tool
description: Use this when changing zdp-architecture-linter CLI commands, flags, JSON output, exit codes, or command documentation.
---

# cli-tool

## Read First

- `AGENTS.md`
- `README.md`
- `CHECKLIST.md`
- `VALIDATION.md`
- `.agents/context-map.md`
- `.agents/checklists/cli-tool.md`
- `docs/cli/command-contract.md`
- `docs/cli/output-and-exit-codes.md`

## Procedure

1. Identify the CLI command and mode: `validate`, `graph`, `explain`, `compliance`, `pack`, `check-split`, `diff`, `doctor`, `normalize`, or `list`.
2. Read the parser and output path in `src/cli.ts` plus the matching report or validation module.
3. Preserve JSON output as machine-readable automation output. Do not include generated file contents, existing source contents, secrets, customer payload, or private incident detail.
4. Add or update tests for success, failure, and `--json` behavior.
5. Update `docs/cli/command-contract.md` and `docs/cli/output-and-exit-codes.md` when command behavior changes.
6. Map verification to mustflow intents from `VALIDATION.md`; do not treat package scripts as command authority.

## Never

- Do not add long-running server, watcher, deployment, provider API, GitHub mutation, or secret operation to this CLI.
- Do not make README examples broader than the configured command contract.
- Do not hide parse errors or validation failures behind success exit codes.

## Final Report

List changed command, JSON fields, exit behavior, tests or intents run, skipped checks, and remaining compatibility risk.

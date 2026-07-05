---
name: fixture-hardening
description: Use this when changing architecture fixtures, schema fixtures, repository-service semantic fixtures, generated registry checks, or source-proof coverage.
---

# fixture-hardening

## Read First

- `AGENTS.md`
- `README.md`
- `CHECKLIST.md`
- `VALIDATION.md`
- `.agents/checklists/fixture-and-contract.md`
- `docs/engineering/05-testing-standard.md`
- relevant fixture harness tests

## Procedure

1. Classify the fixture family before editing.
2. Confirm the fixture proves a real source rule instead of encoding a convenient implementation detail.
3. Keep expected rule IDs, file paths, schema refs, catalog IDs, and source proof stable.
4. Add both failure evidence and a non-regression pass case when the rule boundary could overmatch.
5. Treat generated registry as derived output. Use check/refresh intent instead of hand-editing when it changes.
6. Run full test or the matching focused rule test.

## Never

- Do not use real secrets, account IDs, provider payload, private incident detail, or customer content in fixtures.
- Do not let schema fixture and semantic repository fixture responsibilities blur.
- Do not mark a completed validation from stale generated output.

## Final Report

List fixture family, source rule, changed fixture paths, expected diagnostics, validation intents, and remaining coverage gap.

---
name: architecture-rule
description: Use this when adding or changing ZDP architecture validation rules, diagnostic IDs, severity, source proof, or repository policy gates.
---

# architecture-rule

## Read First

- `AGENTS.md`
- `README.md`
- `CHECKLIST.md`
- `VALIDATION.md`
- `.agents/checklists/architecture-rule.md`
- `docs/architecture/00-system-boundary.md`
- `docs/architecture/01-rule-source-map.md`
- relevant `zdp-architecture` source files

## Procedure

1. Name the policy source before editing: doc, schema, catalog, rule file, or fixture.
2. Define the rule ID, severity, failing condition, allowed exception, and fix hint.
3. Implement the smallest module change that fits the existing rule boundary.
4. Add a failing regression and a passing or exception case.
5. Keep catalog-derived IDs data-driven. Do not hardcode the current ZDP repo list.
6. Update README or CHANGELOG when the public rule surface changes.
7. Run the narrowest focused intent when available; run full test for cross-cutting rule changes.

## Never

- Do not invent ZDP policy in this repository.
- Do not lower hard safety boundaries to warnings for convenience.
- Do not weaken fixture expectations only to keep a test green.

## Final Report

List policy source, rule ID, changed modules, fixture/test evidence, validation intents, and drift risk.

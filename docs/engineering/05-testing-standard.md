# Testing Standard

Status: Active

## Test ownership

Tests prove linter behavior, not the whole ZDP platform. A test should identify the policy source, fixture shape, expected rule ID, and expected pass/fail boundary.

## Required coverage by change type

- New rule: at least one fail case and one pass or exception case.
- Rule severity change: test proving the old boundary no longer applies or the stronger boundary now applies.
- CLI parser change: success, invalid argument, and JSON mode coverage.
- JSON output change: parseable structure and redaction coverage.
- Generated output/freshness change: check mode coverage and stale output failure.
- Source loader change: malformed source, missing source, and valid source coverage.

## Fixture families

- `fixtures/pass/**`: compact architecture policy pass cases.
- `fixtures/fail/**`: compact architecture policy fail cases with expected diagnostics.
- `fixtures/service-schema/pass/**`: full service schema pass cases.
- `fixtures/service-schema/fail/**`: full service schema fail cases.
- `fixtures/repository-service/{pass,fail}/**`: repository root service semantic reference cases.

Do not use one fixture family to prove another family의 contract.

## Validation selection

Use `VALIDATION.md` for mustflow intent mapping. Focused rule tests are acceptable when the changed rule is isolated. Cross-cutting loader, diagnostic, source proof, graph, normalize, diff, or CLI changes require full test.

## Anti-patterns

- Snapshotting a broad JSON blob when a stable field assertion would prove the behavior.
- Removing failing expectation without explaining the source policy change.
- Adding fixture data that looks like a real secret, token, provider payload, or customer record.
- Treating `generated/` as source truth.

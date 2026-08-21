# CI

Status: Active

## CI contract

The repository contract in `service.yaml` declares GitHub Actions as required CI with status check `CI / validate`. The required Ubuntu job proves the linter can type-check, run the complete test suite, and validate this repository root through a self-contained architecture fixture without external provider credentials or a sibling `zdp-architecture` checkout.

`CI / windows-cli-smoke` is a pull-request-only compatibility job. It runs after `CI / validate` and exercises only dependency installation plus the self-contained CLI validation path on `windows-latest`; it intentionally skips the full test suite to keep Windows Actions usage bounded. It is not a required status check in `service.yaml`.

## Self-contained fixture boundary

`fixtures/self-architecture` is an integration fixture, not a policy source or a copy of the canonical architecture repository.

- It contains only loader-required schemas, catalogs, rules, and the `zdp-architecture-linter` repository/service records.
- Its JSON Schemas are intentionally permissive because schema semantics are covered by focused tests and canonical architecture validation.
- Its empty policy catalogs prevent CI from inventing or freezing platform policy in this repository.
- Passing this fixture proves CLI loading, repository-root inspection, `service.yaml` wiring, baseline files, and repository automation checks.
- It does not replace `zdp_architecture_validate_architecture_linter_repository` or `zdp_architecture_validate_fast`, which remain the canonical policy checks.

The CI implementation alias is `bun run validate:self-contained`.

## Agent command mapping

Agents use mustflow intents rather than package scripts as authority:

- `zdp_architecture_linter_typecheck`
- `zdp_architecture_linter_full_test`
- `zdp_architecture_validate_architecture_linter_repository`
- `zdp_architecture_validate_fast`
- focused rules test intents listed in `VALIDATION.md`

Repo-local package scripts remain useful implementation aliases for humans and CI, but they do not grant agent execution permission by themselves.

## CI drift checks

- `service.yaml` automation workflow names and required status checks match actual `.github/workflows`.
- `CI / validate` continues to run typecheck, full tests, and `validate:self-contained`.
- The Windows smoke job stays pull-request-only, depends on the Ubuntu job, and does not expand into the full test suite.
- CI does not require provider secrets, production credentials, live DB, GitHub mutation, deployment, or network-only state.
- CI does not publish npm packages. This package remains private unless a separate release decision changes that boundary.
- Renovate remains the dependency update owner; Dependabot stays disabled unless `service.yaml` is changed.

## Failure handling

If `validate:self-contained` fails, first determine whether the failure is repository drift or fixture wiring drift. Update the fixture only when the loader or repository/service reference contract changed; do not copy new canonical policy into it.

If CI fails after a rule change, inspect source proof and fixture expectation before weakening the rule. If canonical `zdp-architecture` validation fails while the self-contained fixture passes, validate whether linter behavior or source contract should move.

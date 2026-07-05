# CI

Status: Active

## CI contract

The repository contract in `service.yaml` declares GitHub Actions as required CI with status check `CI / validate`. The workflow must continue to prove the linter can type-check, test, and validate its repository contract without external provider credentials.

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
- CI does not require provider secrets, production credentials, live DB, GitHub mutation, deployment, or network-only state.
- CI does not publish npm packages. This package remains private unless a separate release decision changes that boundary.
- Renovate remains the dependency update owner; Dependabot stays disabled unless `service.yaml` is changed.

## Failure handling

If CI fails after a rule change, inspect source proof and fixture expectation before weakening the rule. If CI fails because the central `zdp-architecture` source changed, validate whether linter behavior or source contract should move.

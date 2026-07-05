# System Boundary

Status: Active

## Boundary

`zdp-architecture-linter`는 `zdp-architecture`의 정책 원천을 실행 가능한 검증으로 옮기는 CLI다. 이 저장소는 정책 집행 gate이지 정책 원천이 아니다.

## Owns

- architecture source loader
- service/repository/datastore/data class/event/provider reference validation
- repository baseline and root contract validation
- cross-cutting safety gates for money, privacy, credential, AI user data, public API error, public discovery, i18n, accessibility, security header, feed, asset, color, performance contracts
- graph, normalize, explain, pack, diff, doctor, list reports
- local unit and fixture tests for linter behavior

## Does not own

- final platform policy decisions
- product repository generation
- live deployment or infrastructure mutation
- provider account access
- secret storage or rotation
- customer data, production database, billing provider payload, private incident record

## Source roots

- Policy source: `../../docs/zdp-architecture`
- Linter implementation: `src/**`
- Regression evidence: `tests/**`
- Repository contract: `service.yaml`, `BOUNDARY.md`, `RUNBOOK.md`, `SECURITY.md`
- Agent workflow: `AGENTS.md`, `CHECKLIST.md`, `VALIDATION.md`, `.agents/**`

## Split triggers

- If the CLI starts creating repositories, templates, or deployment resources, that belongs in `zdp-platform-devex` or a separate operations tool.
- If a rule needs product runtime data, that rule belongs in a repo-local checker or runtime service, not this linter.
- If generated registry output becomes a runtime input, create a contract export boundary instead of letting products depend on linter internals.

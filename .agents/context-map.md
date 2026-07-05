# Agent Context Map

Status: Active
Scope: design
Profile: cli-tool

## Routes

- CLI 명령, 옵션, JSON 출력, exit code: `.agents/skills/cli-tool/SKILL.md`
- 새 linter rule, 진단 ID, warning/error 분류: `.agents/skills/architecture-rule/SKILL.md`
- fixture, schema, catalog, generated registry 동기화: `.agents/skills/fixture-hardening/SKILL.md`
- 보안, 개인정보, credential, money, AI 사용자 데이터 경계: `.agents/checklists/security.md`
- 성능과 hot path: `.agents/checklists/performance.md`
- CI, release, rollback, package metadata: `.agents/checklists/ops-change.md`
- 의존성 변경: `.agents/checklists/dependency.md`

## Source-of-truth map

- 정책 원천: `../../docs/zdp-architecture`
- 이 저장소 계약: `service.yaml`, `BOUNDARY.md`, `RUNBOOK.md`, `SECURITY.md`
- CLI 표면: `src/cli.ts`, `README.md`, `docs/cli/*`
- rule implementation: `src/*-rules.ts`, `src/rules/**`
- fixture and regression evidence: `tests/**/*.test.ts`, `../../docs/zdp-architecture/fixtures/**`
- command authority: root `.mustflow/config/commands/zdp-platforms.toml`

## Report boundary

보고할 때는 policy source, changed rule, changed tests, validation intent, skipped validation, remaining drift risk를 분리한다.

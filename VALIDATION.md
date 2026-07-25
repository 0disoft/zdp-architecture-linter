# Validation

Status: Active

이 파일은 `zdp-architecture-linter`에서 쓰는 안정적인 검증 이름과 선택 기준을 정의한다. 에이전트는 repo-local package script를 임의 권한으로 취급하지 않고, mustflow command contract에 등록된 intent를 기준으로 실행한다.

## 검증 이름

| 이름 | 목적 | mustflow intent |
| --- | --- | --- |
| `typecheck` | TypeScript 소스 타입 검증 | `zdp_architecture_linter_typecheck` |
| `full-test` | 전체 Bun test suite | `zdp_architecture_linter_full_test` |
| `validation-performance-profile` | catalog load와 schema validation의 cold/warm 로컬 시간 계측 | `zdp_architecture_linter_profile_validation_performance` |
| `validation-performance-test` | catalog 병렬 load 오류 순서와 schema cache 무효화 집중 검증 | `zdp_architecture_linter_performance_regression_test` |
| `self-architecture-validation` | 이 저장소 루트가 중앙 아키텍처 정책을 통과하는지 확인 | `zdp_architecture_validate_architecture_linter_repository` |
| `architecture-fast-validation` | 중앙 `zdp-architecture` 전체 카탈로그/계약 빠른 검증 | `zdp_architecture_validate_fast` |
| `registry-check` | 생성 registry가 현재 원천과 일치하는지 확인 | `zdp_architecture_registry_check` |
| `runtime-rules-test` | runtime smoke 계약 규칙 집중 검증 | `zdp_architecture_linter_runtime_rules_test` |
| `security-rules-test` | platform security 계약 규칙 집중 검증 | `zdp_architecture_linter_security_rules_test` |
| `infra-rules-test` | infra 계약 규칙 집중 검증 | `zdp_architecture_linter_infra_rules_test` |
| `data-platform-rules-test` | data platform 계약 규칙 집중 검증 | `zdp_architecture_linter_data_platform_rules_test` |
| `connectors-rules-test` | connectors 계약 규칙 집중 검증 | `zdp_architecture_linter_connectors_rules_test` |
| `credential-vault-rules-test` | credential vault 계약 규칙 집중 검증 | `zdp_architecture_linter_credential_vault_rules_test` |
| `privacy-rules-test` | privacy access 계약 규칙 집중 검증 | `zdp_architecture_linter_privacy_rules_test` |

## 선택 기준

- 문서 라우터나 agent instruction만 바뀌면 `self-architecture-validation`을 우선 실행하고, root 문서 정책이 바뀌었으면 `architecture-fast-validation`도 실행한다.
- TypeScript 구현만 바뀌면 `typecheck`와 변경 영역의 focused rules test를 먼저 실행한다.
- catalog load나 schema compile/cache 경계가 바뀌면 `validation-performance-test`를 실행하고, 최적화 전후 비교가 필요할 때 같은 호스트에서 `validation-performance-profile`을 실행한다.
- 새 규칙 ID, 진단 조건, fixture expectation, CLI 출력이 바뀌면 `full-test`까지 실행한다.
- `generated/registry.json`을 갱신하거나 registry 출력 계약이 바뀌면 `registry-check`를 실행한다.
- release, package metadata, public CLI contract가 바뀌면 `full-test`, `self-architecture-validation`, package surface 검증 가능 여부를 함께 보고한다.

## Agent command boundary

`package.json`의 `bun run check`, `bun test`, `bun src/cli.ts ...`는 repo-local 구현 alias다. 사람은 `RUNBOOK.md`의 local command를 참고할 수 있지만, 에이전트는 mustflow에 등록된 intent가 있을 때만 실행한다.

## 검증 결과 보고

최종 보고는 아래를 구분한다.

- 실행한 intent
- 통과한 intent
- 실패한 intent와 첫 실패 원인
- 실행하지 않은 intent와 이유
- 검증 범위가 덮지 못한 남은 위험

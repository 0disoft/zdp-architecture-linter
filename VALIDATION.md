# Validation

Status: Active

이 파일은 `zdp-architecture-linter`에서 쓰는 안정적인 검증 이름과 선택 기준을 정의한다. 에이전트는 작업에 필요한 package scripts와 저장소 CLI를 직접 실행한다.

## 검증 이름

| 이름 | 목적 | 실행 명령 |
| --- | --- | --- |
| `typecheck` | TypeScript 소스 타입 검증 | `bun run check` |
| `full-test` | 전체 Bun test suite | `bun test` |
| `validation-performance-profile` | catalog·schema 하위 단계와 전체 `validateArchitecture` pipeline의 cold/warm 시간, warm p95, schema cache를 계측한다. 같은 runtime의 baseline report를 입력하면 전체 warm p95의 20% 회귀 예산도 판정한다. | `bun run profile:validation -- --iterations 10` |
| `validation-performance-test` | 병렬 작업의 선언 순서, canonical 오류 선택, 동시 schema compile dedupe와 budget 판정을 집중 검증 | `bun test tests/catalog-loader.test.ts tests/json-schema-validator-cache.test.ts` |
| `self-architecture-validation` | 이 저장소 루트가 중앙 아키텍처 정책을 통과하는지 확인 | `bun run validate:self` |
| `architecture-fast-validation` | 중앙 `zdp-architecture` 전체 카탈로그/계약 빠른 검증 | `bun run validate:architecture` |
| `registry-check` | 생성 registry가 현재 원천과 일치하는지 확인 | `bun src/cli.ts normalize --architecture ../../docs/zdp-architecture --out generated/registry.json --check --json` |
| `runtime-rules-test` | runtime smoke 계약 규칙 집중 검증 | `bun test tests/runtime-contract-rules.test.ts` |
| `security-rules-test` | platform security 계약 규칙 집중 검증 | `bun test tests/security-contract-rules.test.ts` |
| `infra-rules-test` | infra 계약 규칙 집중 검증 | `bun test tests/infra-contract-rules.test.ts` |
| `data-platform-rules-test` | data platform 계약 규칙 집중 검증 | `bun test tests/data-platform-contract-rules.test.ts` |
| `connectors-rules-test` | connectors 계약 규칙 집중 검증 | `bun test tests/connectors-contract-rules.test.ts` |
| `credential-vault-rules-test` | credential vault 계약 규칙 집중 검증 | `bun test tests/credential-vault-contract-rules.test.ts` |
| `privacy-rules-test` | privacy access 계약 규칙 집중 검증 | `bun test tests/privacy-contract-rules.test.ts` |

## CI 전용 self-contained 검증

`bun run validate:self-contained`는 `fixtures/self-architecture`와 실제 저장소 루트를 결합해 CLI 로딩, `service.yaml` 연결, baseline 파일, automation 검사를 수행하는 CI implementation alias다. 중앙 `zdp-architecture` 정책을 검증하지 않으며 `self-architecture-validation` 또는 `architecture-fast-validation`을 대체하지 않는다.

Ubuntu의 `CI / validate`는 이 명령을 typecheck와 full test 뒤에 실행한다. pull request의 `CI / windows-cli-smoke`는 같은 명령만 실행해 Windows 경로와 CLI 실행을 확인하며 full test는 반복하지 않는다. 에이전트도 관련 범위를 확인해 이 package script를 직접 실행할 수 있다.

## 선택 기준

- 문서 라우터나 agent instruction만 바뀌면 `self-architecture-validation`을 우선 실행하고, root 문서 정책이 바뀌었으면 `architecture-fast-validation`도 실행한다.
- TypeScript 구현만 바뀌면 `typecheck`와 변경 영역의 focused rules test를 먼저 실행한다.
- catalog load, schema compile/cache, validator scheduling 경계가 바뀌면 `validation-performance-test`를 실행한다.
- 최적화 전후 비교가 필요하면 같은 Bun version, OS, CPU architecture에서 baseline과 current profile을 생성하고 `fullArchitectureValidation.warm.p95Ms`의 회귀 예산을 판정한다. 다른 runtime의 profile은 비교 결과로 인정하지 않는다.
- 새 규칙 ID, 진단 조건, fixture expectation, CLI 출력이 바뀌면 `full-test`까지 실행한다.
- `generated/registry.json`을 갱신하거나 registry 출력 계약이 바뀌면 `registry-check`를 실행한다.
- release, package metadata, public CLI contract가 바뀌면 `full-test`, `self-architecture-validation`, package surface 검증 가능 여부를 함께 보고한다.

## Agent command boundary

`package.json`의 `bun run check`, `bun test`, `bun src/cli.ts ...`는 repo-local 구현 alias다. 사람은 `RUNBOOK.md`의 local command를 참고할 수 있지만, 에이전트도 필요한 local command를 직접 실행한다.

## 검증 결과 보고

최종 보고는 아래를 구분한다.

- 실행한 intent
- 통과한 intent
- 실패한 intent와 첫 실패 원인
- 실행하지 않은 intent와 이유
- 검증 범위가 덮지 못한 남은 위험

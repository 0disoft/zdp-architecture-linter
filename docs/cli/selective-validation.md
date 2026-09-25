# Selective Validation

Status: Active

`validate`는 기본적으로 모든 규칙을 실행한다. 로컬 개발과 좁은 CI 검증에서는 registry selector로 실행 범위를 줄일 수 있다.

## Options

| Option | Meaning |
| --- | --- |
| `--rule <id>` | 정확한 registry rule ID를 선택한다. 반복하거나 쉼표로 여러 ID를 전달할 수 있다. |
| `--group <group>` | 같은 group의 모든 rule을 선택한다. 반복하거나 쉼표로 여러 group을 전달할 수 있다. |
| `--severity <error\|warning>` | 해당 severity만 출력한다. 단일 severity로 등록된 rule은 실행 전에도 제외한다. |

`--rule`과 `--group`은 합집합이다. selector가 없으면 전체 registry가 실행된다. 알 수 없는 rule, group, severity는 검증을 시작하지 않고 CLI usage failure로 종료한다.

```txt
zdp-arch validate --architecture ../../docs/zdp-architecture --rule catalog.repositories
zdp-arch validate --architecture ../../docs/zdp-architecture --group service --severity error --json
zdp-arch validate --architecture ../../docs/zdp-architecture --repository . --rule repository.baseline
zdp-arch validate --architecture ../../docs/zdp-architecture --group repository,cross-cutting --severity warning
```

## Registry contract

`src/rule-registry.ts`의 각 entry는 아래 메타데이터를 가진다.

| Field | Contract |
| --- | --- |
| `id` | CLI와 코드가 공유하는 안정적인 선택 ID다. |
| `group` | `schema`, `catalog`, `service`, `fixture`, `repository`, `cross-cutting` 중 하나다. |
| `defaultSeverity` | `error`, `warning`, `mixed` 중 하나다. 실제 diagnostic severity를 대체하지 않는다. |
| `sourceProof` | 규칙 의미를 뒷받침하는 architecture 문서, schema, catalog, rule, fixture, live contract 경로다. |
| `appliesTo` | 검사가 읽거나 판정하는 주요 파일 표면이다. |
| `inputs` | `architecture`, `repository-root`, `repository-contract` 중 필요한 입력이다. |

registry ID는 diagnostic `ruleId`와 별개다. 하나의 registry rule은 같은 정책 경계에서 나오는 여러 diagnostic ID를 실행할 수 있다. diagnostic ID의 호환성 계약은 `output-and-exit-codes.md`를 따른다.

## Fail-closed boundary

`catalog.schema-preflight`는 `alwaysRun`이다. 선택 실행에서도 catalog와 rule YAML의 schema preflight를 건너뛰지 않는다. 잘못된 architecture 입력 위에서 일부 validator만 성공한 것처럼 보이게 만들지 않기 위해서다.

`--severity`는 preflight error를 숨기지 않는다. preflight가 통과한 뒤에만 선택된 validator 결과에 severity 필터를 적용한다.

## Repository input avoidance

선택된 rule metadata에 `repository-contract` 입력이 없으면 live `service.yaml`을 읽지 않는다. 예를 들어 `repository.baseline`은 repository root의 기본 파일만 검사하므로 malformed 또는 아직 작성되지 않은 `service.yaml`과 독립적으로 실행할 수 있다.

이 최적화는 선택 실행에만 적용된다. selector 없는 기본 검증은 기존과 동일하게 전체 repository contract를 읽고 모든 규칙을 실행한다.

# Command Contract

Status: Active

이 문서는 `zdp-arch` CLI의 명령 계약이다. 실제 parser, 명령 구현, 실패 출력 정규화는 `src/cli.ts`와 관련 report/validation module이 소유한다.

## Global contract

- `--architecture <path>`는 `zdp-architecture` 루트를 가리킨다.
- `--repository <path>` 또는 `--repo <repo>`는 검증 대상 저장소 루트 또는 task pack 대상 repo ID를 가리킨다.
- `--json`은 자동화가 읽을 수 있는 기존 ZDP JSON을 stdout으로 출력한다.
- `validate --format sarif`는 같은 validation 결과를 SARIF 2.1.0으로 stdout에 출력한다.
- `--json`과 `--format sarif`는 함께 사용할 수 없고, SARIF는 `validate`에서만 허용한다.
- 잘못된 명령, 필수 옵션 누락, 충돌하는 옵션을 포함한 모든 실패는 exit `1`을 반환한다.
- `--json`을 요청한 CLI 자체 실패는 `zdp.architecture.cli-error.v1` envelope 하나만 stdout에 출력하고 stderr를 비운다.
- JSON 모드의 예상하지 못한 실행 오류는 원문 오류를 되비추지 않고 `command_failed`로 redaction한다. 사람이 실행한 text mode는 수정에 필요한 상세 오류를 stderr로 출력한다.
- CLI는 provider API, GitHub mutation, deployment, secret rotation, database migration을 실행하지 않는다.
- 정책 판단은 `zdp-architecture` 원천 파일에서 오며, 이 저장소가 새 ZDP 정책을 임의로 만들지 않는다.

## Commands

| Command | Purpose | Writes | Primary modules |
| --- | --- | --- | --- |
| `validate` | architecture root와 선택 repository root의 계약을 검증하고 text, ZDP JSON 또는 SARIF로 출력한다. `--rule`, `--group`, `--severity`로 실행 범위를 줄일 수 있다. | 없음 | `src/validation.ts`, `src/rule-registry.ts`, `src/sarif-report.ts`, `src/*-rules.ts`, `src/rules/**` |
| `graph` | repository, service, datastore, data class, event, provider 관계를 graph edge로 출력한다. | 없음 | `src/architecture-graph*.ts` |
| `explain` | 진단 ID와 source proof를 사람이 고칠 수 있게 설명한다. | 없음 | `src/diagnostic-explain-report.ts` |
| `compliance` | 선택 repository의 계약 선언, 정적 검증, 구현·live 증거 상태를 분리해 report-only로 출력한다. | 없음 | `src/contract-compliance-report.ts`, `src/validation.ts` |
| `pack` | 특정 repo/task를 위한 bounded LLM task pack을 만든다. | 선택된 `--out`만 | `src/architecture-pack-report.ts` |
| `check-split` | split trigger와 repository registration drift를 점검한다. | 없음 | `src/split-rules.ts`, `src/cli.ts` |
| `diff` | base/head 사이의 catalog 핵심 ID와 진단 변화량을 비교하고, 선택적으로 새 error를 CI에서 차단한다. | 임시 snapshot만 | `src/architecture-diff-report.ts`, `src/git-architecture-snapshot.ts` |
| `doctor` | architecture root와 repository root의 읽기 가능성, Git 상태, validation readiness를 점검한다. | 없음 | `src/architecture-doctor-report.ts` |
| `normalize` | architecture registry를 정규화해 출력하거나 freshness check를 수행한다. | 선택된 `--out`만 | `src/architecture-normalize-report.ts`, `src/generated-output.ts` |
| `list repos` | repository catalog를 필터링해 출력한다. | 없음 | `src/architecture-list-report.ts` |
| `list services` | service catalog를 필터링해 출력한다. | 없음 | `src/architecture-list-report.ts` |

`diff`의 `--base`와 `--head`는 비어 있지 않고 앞뒤 또는 제어 공백이 없으며 `-`로 시작하지 않는 Git revision이어야 한다. 현재 작업 트리를 뜻하는 `worktree`는 `--head`에서만 허용한다.

`diff`는 기본적으로 report-only이며 진단 변화가 있어도 비교 보고서를 출력한 뒤 exit `0`을 반환한다. `--fail-on-new-error`를 지정하면 base에는 없고 head에 새로 추가된 `severity: error` 진단이 하나라도 있을 때 같은 보고서를 출력한 뒤 exit `1`을 반환한다. base와 head에 모두 존재하는 기존 error, 새 warning, 해결된 진단은 이 gate를 실패시키지 않는다.

## Validate output selection

아무 출력 옵션도 없으면 사람이 읽는 text를 출력한다. `--json`은 기존 `ValidationResult` JSON을 유지한다. `--format sarif`는 진단을 SARIF 2.1.0 `runs[0].results`로 변환한다. 출력 형식은 validation의 성공·실패 판정을 바꾸지 않는다.

```shell
zdp-arch validate --architecture ../zdp-architecture --repository . --format sarif > zdp-architecture.sarif
```

SARIF fingerprint, location, rule descriptor 계약은 `docs/cli/sarif.md`가 소유한다.

## Selective validate contract

`validate` 전용 selector는 아래 계약을 따른다. 상세 registry metadata와 예시는 `docs/cli/selective-validation.md`에 있다.

- `--rule <id>`는 정확한 registry ID를 선택한다.
- `--group <group>`은 같은 group의 rule을 선택한다.
- `--severity <error|warning>`는 validator 실행과 최종 diagnostic 출력 범위를 줄인다.
- 같은 option을 반복하거나 쉼표로 여러 값을 전달할 수 있다.
- `--rule`과 `--group`은 합집합이다.
- selector가 없으면 기존 전체 검증과 동일하다.
- 알 수 없는 selector는 filesystem validation 전에 usage failure로 종료한다.
- architecture catalog schema preflight는 selector와 무관하게 항상 실행한다.
- 선택 rule에 `repository-contract` 입력이 없으면 live `service.yaml`을 읽지 않는다.

## Side effect policy

- `validate`, `graph`, `explain`, `compliance`, `check-split`, `diff`, `doctor`, `list`는 source tree를 수정하지 않는다.
- `pack`과 `normalize`는 명시적인 output path가 있을 때만 쓴다.
- generated output path는 architecture root의 `generated/` 아래에 있어야 하며 symbolic link 또는 junction을 경유할 수 없다.
- generated output은 source of truth가 아니다. `zdp-architecture`의 docs, schemas, catalogs, rules, fixtures가 source다.

`compliance`는 `--repository`를 필수로 받는다. `service.yaml` 선언과 validation 결과는 현재 입력에서 계산하지만, 구현 증거 adapter와 revision/environment에 묶인 live evidence adapter가 없는 상태를 통과로 추정하지 않고 `unknown`으로 남긴다. report-only는 무변경을 뜻하며 validation error를 성공 exit code에 숨긴다는 뜻이 아니다.

## Command authority

에이전트 검증 실행은 root mustflow intent로 매핑한다. 대표 intent는 `VALIDATION.md`에 있다. README나 RUNBOOK의 raw package script는 사람을 위한 local alias이지 에이전트 권한이 아니다.

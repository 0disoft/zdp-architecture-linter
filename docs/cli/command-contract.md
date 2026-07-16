# Command Contract

Status: Active

이 문서는 `zdp-arch` CLI의 명령 계약이다. 실제 parser와 구현은 `src/cli.ts`와 관련 report/validation module이 소유한다.

## Global contract

- `--architecture <path>`는 `zdp-architecture` 루트를 가리킨다.
- `--repository <path>` 또는 `--repo <repo>`는 검증 대상 저장소 루트 또는 task pack 대상 repo ID를 가리킨다.
- `--json`은 자동화가 읽을 수 있는 JSON을 stdout으로 출력한다.
- CLI는 provider API, GitHub mutation, deployment, secret rotation, database migration을 실행하지 않는다.
- 정책 판단은 `zdp-architecture` 원천 파일에서 오며, 이 저장소가 새 ZDP 정책을 임의로 만들지 않는다.

## Commands

| Command | Purpose | Writes | Primary modules |
| --- | --- | --- | --- |
| `validate` | architecture root와 선택 repository root의 계약을 검증한다. | 없음 | `src/validation.ts`, `src/*-rules.ts`, `src/rules/**` |
| `graph` | repository, service, datastore, data class, event, provider 관계를 graph edge로 출력한다. | 없음 | `src/architecture-graph*.ts` |
| `explain` | 진단 ID와 source proof를 사람이 고칠 수 있게 설명한다. | 없음 | `src/diagnostic-explain-report.ts` |
| `compliance` | 선택 repository의 계약 선언, 정적 검증, 구현·live 증거 상태를 분리해 report-only로 출력한다. | 없음 | `src/contract-compliance-report.ts`, `src/validation.ts` |
| `pack` | 특정 repo/task를 위한 bounded LLM task pack을 만든다. | 선택된 `--out`만 | `src/architecture-pack-report.ts` |
| `check-split` | split trigger와 repository registration drift를 점검한다. | 없음 | `src/split-rules.ts`, `src/cli.ts` |
| `diff` | base/head 사이의 catalog 핵심 ID와 진단 변화량을 비교한다. | 임시 snapshot만 | `src/architecture-diff-report.ts`, `src/git-architecture-snapshot.ts` |
| `doctor` | architecture root와 repository root의 읽기 가능성, Git 상태, validation readiness를 점검한다. | 없음 | `src/architecture-doctor-report.ts` |
| `normalize` | architecture registry를 정규화해 출력하거나 freshness check를 수행한다. | 선택된 `--out`만 | `src/architecture-normalize-report.ts`, `src/generated-output.ts` |
| `list repos` | repository catalog를 필터링해 출력한다. | 없음 | `src/architecture-list-report.ts` |
| `list services` | service catalog를 필터링해 출력한다. | 없음 | `src/architecture-list-report.ts` |

## Side effect policy

- `validate`, `graph`, `explain`, `compliance`, `check-split`, `diff`, `doctor`, `list`는 source tree를 수정하지 않는다.
- `pack`과 `normalize`는 명시적인 output path가 있을 때만 쓴다.
- generated output은 source of truth가 아니다. `zdp-architecture`의 docs, schemas, catalogs, rules, fixtures가 source다.

`compliance`는 `--repository`를 필수로 받는다. `service.yaml` 선언과 validation 결과는 현재 입력에서 계산하지만, 구현 증거 adapter와 revision/environment에 묶인 live evidence adapter가 없는 상태를 통과로 추정하지 않고 `unknown`으로 남긴다. report-only는 무변경을 뜻하며 validation error를 성공 exit code에 숨긴다는 뜻이 아니다.

## Command authority

에이전트 검증 실행은 root mustflow intent로 매핑한다. 대표 intent는 `VALIDATION.md`에 있다. README나 RUNBOOK의 raw package script는 사람을 위한 local alias이지 에이전트 권한이 아니다.

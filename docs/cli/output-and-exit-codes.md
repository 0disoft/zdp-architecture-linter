# Output And Exit Codes

Status: Active

## Output principles

- Human output은 사람이 고칠 파일과 필드를 빠르게 찾도록 작성한다.
- JSON output은 자동화가 안정적으로 파싱할 수 있어야 한다.
- SARIF output은 GitHub code scanning과 SARIF consumer가 같은 논리 진단을 실행 간 추적할 수 있어야 한다.
- JSON과 SARIF output은 generated file content, existing source file content, secret, customer raw payload, provider raw payload, private incident detail을 포함하지 않는다.
- 진단은 가능한 한 `ruleId`, `severity`, `message`, `file`, `path`, `sourceProof` 같은 구조로 원인과 수정 위치를 분리한다.
- `--json` 실패는 stdout에 JSON 문서 하나만 출력하고 stderr를 비운다. text mode 실패는 stdout을 비우고 stderr에 사람이 고칠 수 있는 상세 오류를 출력한다.

## SARIF output contract

`validate --format sarif`은 SARIF `2.1.0` log를 stdout에 출력한다. 기존 `--json`과 함께 지정하면 모호한 이중 형식이므로 argument error로 거부한다. SARIF 선택은 warning과 error의 exit code 의미를 바꾸지 않는다.

각 result는 `ruleId`, `level`, message, source-relative artifact URI, ZDP logical path와 `partialFingerprints`를 가진다. GitHub 추적용 `primaryLocationLineHash`와 도구 고유 `zdpDiagnostic/v1`은 같은 stable fingerprint에서 파생한다. 자세한 계산과 호환성 계약은 `docs/cli/sarif.md`가 소유한다.

## Exit codes

| Exit | Meaning |
| --- | --- |
| `0` | 요청한 명령이 성공했고 blocking diagnostics 또는 freshness failure가 없다. |
| `1` | validation failure, freshness failure, invalid argument, unreadable source, parse error, command contract violation이 있다. |

잘못된 명령, 필수 옵션 누락, 알 수 없는 옵션과 충돌하는 옵션도 exit `1`을 반환한다. 별도의 usage 전용 exit code는 사용하지 않는다.

`diff`는 기본적으로 비교 보고서만 생성하므로 새 진단이 있어도 exit `0`을 반환한다. `--fail-on-new-error`를 지정한 경우에만 `diagnostics.added`에 `severity: error`가 하나 이상 있으면 exit `1`을 반환한다. base에 이미 존재한 error, 새 warning, 해결된 진단은 차단 조건이 아니다.

`diff --fail-on-new-error --json`이 새 error를 발견해 exit `1`을 반환해도 완전한 diff report JSON은 stdout에 유지하고 stderr에는 별도 실패 문구를 쓰지 않는다. 따라서 CI는 종료 코드로 차단 여부를 판단하면서 같은 JSON의 `diagnostics.added`에서 원인을 읽을 수 있다.

`diff`의 `--base` 또는 `--head`가 비어 있거나, 앞뒤·제어 공백을 포함하거나, `-`로 시작하면 Git을 실행하지 않고 invalid argument로 exit `1`을 반환한다.

새 exit code를 추가하려면 `src/cli.ts`, CLI tests, README, 이 문서를 함께 바꾼다.

## CLI failure JSON contract

명령별 정상 report나 validation diagnostics를 만들기 전에 실패한 경우 `--json`은 아래 versioned envelope를 반환한다.

```json
{
  "schemaVersion": "zdp.architecture.cli-error.v1",
  "status": "failed",
  "error": {
    "code": "invalid_arguments",
    "message": "Invalid command or arguments.",
    "details": {}
  }
}
```

`error.code`는 다음 의미를 가진다.

| Code | Meaning |
| --- | --- |
| `invalid_arguments` | 명령, 필수 옵션, positional argument 또는 옵션 조합이 parser 계약을 통과하지 못했다. |
| `generated_output_stale` | `pack` 또는 `normalize` freshness check의 기존 산출물이 기대 내용과 다르다. |
| `validation_failed` | generated output을 쓰거나 검사하기 전에 blocking validation error가 발견됐다. |
| `command_failed` | 앞의 안정적인 분류로 공개할 수 없는 읽기, 파싱, Git 또는 실행 오류다. |

`error.message`는 자동화와 사용자에게 공개해도 되는 안정적인 문구다. `error.details`는 usage, 사용자 지정 상대 output path, remediation, error count 같은 안전한 구조 정보만 담으며 로컬 절대 경로를 반환하지 않는다. 예상하지 못한 오류의 원문 message, source fragment, provider payload와 private path detail은 `command_failed` JSON에 포함하지 않는다. 같은 실패를 text mode로 실행하면 로컬 수정에 필요한 원문 오류를 stderr에서 확인할 수 있다.

이미 독립 schema를 가진 명령 report는 그 schema를 유지한다. `validate`, `graph` preflight와 같은 구조화된 diagnostics, `doctor` report, `compliance` report는 성공과 정책 실패를 기존 명령별 JSON으로 표현한다. 입력을 읽거나 파싱할 수 없는 `compliance` 실패도 `zdp.architecture.contract-compliance-report.v1`을 유지하면서 `error.code`와 공개 가능한 `error.message`를 반환한다.

## Compliance JSON contract

`compliance --json`은 `zdp.architecture.contract-compliance-report.v1` schema version과 아래 독립 상태를 반환한다.

- `declaration`: `service.yaml`의 `declared` 또는 `missing`
- `implementation`: 구현 증거 adapter가 없으면 `unknown`
- `verification`: 현재 validation 결과에 따른 `passed`, `passed_with_warnings`, `failed`
- `live`: revision/environment에 묶인 운영 증거 adapter가 없으면 `unknown`

정적 검증이 통과해도 top-level status는 구현·live 증거가 비어 있음을 나타내는 `evidence_incomplete`다. `service.yaml`이 없거나 error diagnostic이 있으면 `failed`와 exit `1`을 함께 반환한다. warnings와 unknown 상태만으로는 exit `1`을 만들지 않는다.

repository 또는 architecture 입력을 읽거나 파싱할 수 없으면 원문 내용을 되비추지 않고 `error.code: repository_or_architecture_input_unreadable_or_invalid`와 공개 가능한 고정 message를 가진 같은 schema version의 실패 JSON과 exit `1`을 반환한다.

## Diagnostic compatibility

진단 ID의 의미를 바꾸는 것은 호환성 변화다. 조건을 좁히는 rollback은 가능하지만, 기존 ID를 다른 정책 의미로 재사용하지 않는다. 새 정책 의미가 필요하면 새 rule ID를 만든다.

기본 fingerprint는 versioned namespace, `ruleId`, normalized source-relative `file`, logical `path`로 계산한다. message 문구와 severity는 fingerprint에 넣지 않는다. 따라서 설명 문구 수정은 같은 진단으로 유지되고, `diff`는 severity 변경만 별도 변화로 보고한다.

같은 rule과 위치에서 둘 이상의 독립 진단을 내야 하거나 파일·path 이동 중 identity를 유지해야 하면 producer가 명시적 `fingerprint`를 제공한다. fingerprint 알고리즘이나 입력 의미를 바꾸려면 namespace와 SARIF property version을 올리고 회귀 테스트를 추가한다.

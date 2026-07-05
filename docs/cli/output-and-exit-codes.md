# Output And Exit Codes

Status: Active

## Output principles

- Human output은 사람이 고칠 파일과 필드를 빠르게 찾도록 작성한다.
- JSON output은 자동화가 안정적으로 파싱할 수 있어야 한다.
- JSON output은 generated file content, existing source file content, secret, customer raw payload, provider raw payload, private incident detail을 포함하지 않는다.
- 진단은 가능한 한 `ruleId`, `severity`, `message`, `file`, `path`, `sourceProof` 같은 구조로 원인과 수정 위치를 분리한다.

## Exit codes

| Exit | Meaning |
| --- | --- |
| `0` | 요청한 명령이 성공했고 blocking diagnostics 또는 freshness failure가 없다. |
| `1` | validation failure, freshness failure, invalid argument, unreadable source, parse error, command contract violation이 있다. |

새 exit code를 추가하려면 `src/cli.ts`, CLI tests, README, 이 문서를 함께 바꾼다.

## JSON failure contract

`--json` 모드의 실패는 automation이 읽을 수 있어야 한다. stderr에만 실패 이유를 쓰거나, success-like JSON과 non-zero exit을 섞어 모호하게 만들지 않는다.

## Diagnostic compatibility

진단 ID의 의미를 바꾸는 것은 호환성 변화다. 조건을 좁히는 rollback은 가능하지만, 기존 ID를 다른 정책 의미로 재사용하지 않는다. 새 정책 의미가 필요하면 새 rule ID를 만든다.

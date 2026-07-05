# CLI Tool Checklist

Status: Active

## Failure modes

- CLI help와 실제 parser가 다른 명령 또는 옵션을 말한다.
- JSON 출력이 machine-readable 계약을 깨거나 secret/customer payload를 포함한다.
- 새 exit code 의미가 README, tests, docs와 동기화되지 않는다.
- `--json` 실패 출력이 stderr와 stdout을 혼합해 자동화가 파싱하지 못한다.
- `pack`, `diff`, `doctor`, `normalize`, `list`처럼 파일 또는 git state를 읽는 명령이 cleanup, timeout, buffer, path boundary를 잃는다.

## Checklist

- 변경한 명령의 source는 `src/cli.ts`와 관련 report/validation module에서 확인했다.
- `docs/cli/command-contract.md`에 명령, required input, side effect, output boundary를 반영했다.
- `docs/cli/output-and-exit-codes.md`에 JSON shape 또는 exit code 변화가 반영됐다.
- `tests/cli-*.test.ts` 또는 관련 report test가 success, failure, JSON mode를 검증한다.
- 경로 인자는 선택된 architecture root와 repository root 밖을 정책 원천처럼 다루지 않는다.
- 새 command recipe는 mustflow intent로 매핑하거나 manual-only로 남겼다.

## Validation

- 기본: `zdp_architecture_linter_typecheck`
- CLI 출력 변화: `zdp_architecture_linter_full_test`
- repository root 계약 변화: `zdp_architecture_validate_architecture_linter_repository`

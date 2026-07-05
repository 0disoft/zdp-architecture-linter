# CLI

Status: Active

`zdp-architecture-linter`의 CLI는 ZDP 정책 원천을 읽어 검증, 그래프, 설명, normalize, diff, task pack, doctor, list 출력을 만든다.

## Documents

- `command-contract.md`: 명령별 입력, 출력, side effect, 금지 동작
- `output-and-exit-codes.md`: JSON 출력과 exit code 계약

## Ownership

CLI는 로컬 파일 기반 검증기다. GitHub, Cloudflare, npm, database, provider, deployment platform을 변경하지 않는다. 파일을 쓰는 명령은 명시적인 output path와 freshness check 계약을 가져야 한다.

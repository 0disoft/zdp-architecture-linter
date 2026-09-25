# Documentation

Status: Active

이 디렉터리는 `zdp-architecture-linter`의 repo-local 운영 문서다. ZDP 정책 원천은 여기가 아니라 `../../docs/zdp-architecture`다.

## Source of truth

- CLI command contract: `docs/cli/command-contract.md`
- Selective validation and rule registry: `docs/cli/selective-validation.md`
- CLI output and exit code contract: `docs/cli/output-and-exit-codes.md`
- Linter/system boundary: `docs/architecture/00-system-boundary.md`
- Rule source map: `docs/architecture/01-rule-source-map.md`
- Testing standard: `docs/engineering/05-testing-standard.md`
- CI and command authority: `docs/ops/ci.md`
- Release behavior: `docs/ops/release.md`
- Rollback behavior: `docs/ops/rollback.md`

## Drift rule

문서가 code, tests, `service.yaml`, root mustflow command contract와 어긋나면 code와 command contract를 먼저 확인하고 문서를 고친다. 정책 의미가 어긋나면 `zdp-architecture` 원천을 먼저 확인한다.

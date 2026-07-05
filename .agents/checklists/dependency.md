# Dependency Checklist

Status: Active

## Failure modes

- 새 runtime dependency가 parser/validator 경계보다 큰 권한을 가져온다.
- Ajv, YAML, TypeScript, Bun 변경이 schema dialect, YAML parsing, ESM behavior, test runner behavior를 바꾼다.
- package update가 lockfile이나 CI install contract 없이 들어간다.
- dependency update bot 설정이 Renovate와 Dependabot을 동시에 활성화한다.

## Checklist

- dependency가 필요한 이유와 Node/Bun 내장 대안이 검토됐다.
- schema dialect, YAML scalar handling, duplicate key handling, ESM import behavior 영향이 확인됐다.
- `bun.lock`, `package.json`, README/CHANGELOG/package metadata 동기화 필요 여부를 확인했다.
- Renovate/Dependabot ownership은 `service.yaml` automation 계약과 맞다.
- dependency 변경은 package install/update intent가 있을 때만 에이전트가 실행한다.

## Validation

- type surface: `zdp_architecture_linter_typecheck`
- behavior surface: `zdp_architecture_linter_full_test`
- repository contract: `zdp_architecture_validate_architecture_linter_repository`

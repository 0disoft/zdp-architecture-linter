# Ops Change Checklist

Status: Active

## Failure modes

- CI status name이 `service.yaml`의 required status check와 어긋난다.
- release helper, Renovate, ruleset, issue template, PR template 계약이 README와 service.yaml에서 다르게 보인다.
- version bump, CHANGELOG, rule behavior change가 분리되어 release note를 만들 수 없다.
- rollback이 rule ID 제거와 진단 의미 변경을 구분하지 않는다.

## Checklist

- `service.yaml` automation fields와 실제 `.github/**` 파일을 함께 확인했다.
- CI 변경은 configured intent 또는 manual boundary로 문서화했다.
- rule behavior나 CLI output change는 `CHANGELOG.md`와 package version 정책을 확인했다.
- release 문서는 npm publish와 GitHub public visibility를 혼동하지 않는다.
- rollback 문서는 rule condition narrowing, fixture revert, diagnostic compatibility를 구분한다.

## Validation

- repository automation surface: `zdp_architecture_validate_architecture_linter_repository`
- broad linter confidence: `zdp_architecture_linter_full_test`
- root architecture contract: `zdp_architecture_validate_fast`

# Security Checklist

Status: Active

## Failure modes

- secret, payment payload, customer raw data, private incident detail이 fixture, snapshot, generated output, CLI JSON에 들어간다.
- credential, privacy, money, AI user data 차단 규칙을 편의상 warning으로 낮춘다.
- 외부 provider, GitHub, database, deployment API 호출을 linter 검증 필수 조건으로 만든다.
- raw token처럼 보이는 테스트 값이 실제 scanner를 혼란스럽게 만든다.

## Checklist

- 테스트 fixture는 명시적인 가짜 필드명과 금지 class만 사용한다.
- CLI output은 source content dump가 아니라 path, rule id, message, evidence summary만 담는다.
- credential/privacy/money/AI 관련 rule은 source proof와 fail fixture가 있다.
- 외부 네트워크, provider account, secret backend, live DB가 없어도 검증된다.
- 공개 전환 문구는 npm publish, license grant, secret scanning을 구분한다.

## Validation

- security boundary rule: `zdp_architecture_linter_security_rules_test` 또는 관련 focused test
- broad rule changes: `zdp_architecture_linter_full_test`
- repository contract: `zdp_architecture_validate_architecture_linter_repository`

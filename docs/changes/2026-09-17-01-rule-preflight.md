# 정책 입력 사전 검사

검토 항목 1의 구현이다. 원천은 `zdp-architecture/rules/money.rules.yaml`의 rule_contract와 현재 rule interpreter가 읽는 입력 구조다.

공통 사전 검사에서 잘못된 rules 배열, rule id, assertions 객체와 assertion group 타입을 `ZDP-POLICY-000` 오류로 처리한다. 금전 정책에서 boolean을 문자열로 작성해 검사가 사라지는 경로도 차단한다. 명시적인 `rules: []`는 계속 허용하며 플랫폼의 정책 값이나 서비스 목록은 추가하지 않는다.

이 변경은 CLI의 공통 사전 검사 경계를 강화한다. 개별 low-level policy builder를 직접 호출하는 코드는 이 검사를 먼저 수행해야 한다. 중앙 저장소에 정식 rule schema를 추가하면 이 구조 검사를 해당 schema 검증으로 대체할 수 있다.

검증 대상으로 `zdp_architecture_linter_typecheck`, `zdp_architecture_linter_full_test`, `zdp_architecture_validate_fast`가 필요하다. 작성 환경에는 Bun과 root mustflow command contract가 없어 로컬 실행하지 않았다. 추가한 회귀 테스트의 실행 결과는 PR CI에서 별도로 확인해야 한다.

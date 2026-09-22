# 상태 전이의 기준 정책 유지

검토 항목 2의 구현이다. `rules/tier.rules.yaml`의 기존 state_transition_evidence 계약을 사용한다. 새 정책 값은 정의하지 않는다.

증거 평가를 state-transition-evidence.ts로 분리하고 diff 모듈은 base/head 정책 선택을 소유한다. 정책이 바뀌면 두 정책을 모두 적용해 같은 변경에서 보호 상태를 제거하거나 증거 유효기간을 늘려 승격 검사를 면제하지 못하게 한다. 중복 진단은 제거한다.

정책 삭제, 필수 필드·보호 상태 제거, 증거 유효기간 증가는 ZDP-STATE-TRANSITION-000으로 별도 표시한다. 정책 완화 승인 체계는 중앙 원천에 아직 정의되지 않았으므로 이 PR에서 임의로 승인 필드나 자동 면제를 추가하지 않는다.

실패·통과 회귀 테스트를 추가했다. 로컬 Bun과 root mustflow 환경 부재로 typecheck/full-test intent는 실행하지 않았으며 PR CI 확인이 필요하다.

# 비교 불가능한 입력 차단

검토 항목 4이며 check-split/CLI 분리 PR 다음에 적용한다. diff가 base/head의 공통 사전 검사를 모두 통과한 후에만 정책 검증과 비교를 실행한다.

실패 시 기존 cli-error.v1 envelope의 validation_failed를 사용하고 details.comparisonStatus에 comparison_blocked를 기록한다. base/head 진단을 각각 보존하며 같은 오류가 양쪽에 남았더라도 상쇄하지 않는다. --fail-on-new-error 유무와 무관하게 exit 1을 반환하고 임시 스냅샷을 정리한다. 정상 입력의 기존 정책 위반을 점진적으로 처리하는 기존 동작은 유지한다.

순수 admission 테스트와 실제 Git 두 리비전 CLI 회귀를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았으며 CI 결과 확인이 필요하다.

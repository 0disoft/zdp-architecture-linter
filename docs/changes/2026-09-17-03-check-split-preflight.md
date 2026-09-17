# check-split 입력 실패 보존

검토 항목 3의 구현이다. check-split이 ValidationContext의 사전 검사 결과를 먼저 확인하고, 실패하면 원래 입력 진단과 exit 1을 반환한다. 정상 입력에서만 ZDP-SPLIT-001 결과를 선택하므로 관련 없는 정책 경고를 숨기는 기존 동작은 유지한다.

같은 context를 후속 검증에 전달해 입력을 다시 읽지 않는다. JSON과 text 실패 회귀 테스트를 추가했다. 이어지는 diff 수정이 CLI 파서와 섞이지 않도록 기존 diff 실행과 cleanup을 cli-diff.ts로 동작 변경 없이 추출했다. 파서 옵션과 기존 출력 계약은 유지한다.

로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았다. PR CI에서 기존 전체 CLI 테스트와 새 실패 회귀를 확인해야 한다.

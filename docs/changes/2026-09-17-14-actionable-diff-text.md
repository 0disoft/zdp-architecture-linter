# 수정 위치를 보여주는 diff 텍스트

검토 항목 14이며 fingerprint PR 다음에 적용한다. 기존 비교/요약 로직을 architecture-diff-core.ts로 옮기고 공개 report 모듈은 기존 exports를 유지하면서 text presentation을 소유한다.

새 오류를 경고와 카탈로그 요약보다 먼저 출력한다. 각 항목에 severity, rule id, 파일, 논리 경로, 전체 메시지를 포함한다. 메시지의 줄바꿈은 이스케이프해 하나의 진단을 하나의 로그 행으로 유지한다. JSON 결과와 입력 배열 순서는 변경하지 않는다.

새 오류 없음, 정렬, 전체 위치/메시지, resolved count와 비변이 회귀 테스트를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았으며 PR CI 확인이 필요하다.

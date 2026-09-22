# 개별 repository schema 진단

검토 항목 8이며 fingerprint v2 PR 다음에 적용한다. AJV의 모든 schema 오류를 각기 Diagnostic으로 보존하고 기존 다섯 개 표시 상한을 제거한다. schemaError에는 keyword, instancePath, schemaPath, missingProperty, additionalProperty 중 해당 필드를 기록한다. 원본 입력 값이나 전체 AJV params는 노출하지 않는다.

각 오류의 fingerprint는 repository name, schema 위치, keyword와 해당 property로 구분한다. 같은 부모 경로의 필수 필드 누락도 서로 다른 오류로 추적하며 repository 순서 변경은 identity를 바꾸지 않는다. 단일 오류의 기존 표시 경로와 메시지는 유지한다.

실패한 validator가 오류 목록을 반환하지 않더라도 성공처럼 빈 진단을 반환하지 않는다. 기존 pass/required/enum 회귀를 유지·갱신하고 5개 초과 오류, fingerprint 중복 방지, 순서 변경 회귀를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았다.

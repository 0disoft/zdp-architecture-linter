# 배열 순서와 무관한 진단 식별자

검토 항목 7의 구현이다. getStableDiagnosticFingerprint는 legacy index:id와 id= 경로를 같은 식별 경로로 정규화한 v2 해시를 생성한다. diff와 SARIF primary fingerprint가 v2를 사용한다.

기존 getDiagnosticFingerprint API, SARIF zdpDiagnostic/v1, properties.zdpFingerprint는 보존하여 저장된 v1 보고서와의 전환 경로를 남긴다. SARIF에는 zdpDiagnostic/v2가 추가된다. producer가 명시한 fingerprint는 계속 우선한다.

식별자가 없는 숫자 전용 경로는 위치 기반으로 유지한다. 특히 dependency 배열을 숫자 인덱스로만 진단하는 producer는 추후 대상 ID를 경로에 제공해야 자식 배열 재정렬까지 안정화된다. 중복 ID의 모호성은 별도의 catalog identity preflight PR이 차단한다.

기존 v1 golden test를 유지하고 v2/SARIF/diff 재정렬 회귀를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았다.

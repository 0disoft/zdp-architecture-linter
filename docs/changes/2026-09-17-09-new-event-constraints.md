# 새 이벤트 제약의 호환성 검사

검토 항목 9의 구현이다. 파일 읽기·마이그레이션 증거 검증과 순수 schema 비교를 분리하고, 기존에 없던 enum/const/items/additionalProperties schema 제약을 비교한다. 열린 객체에 선택 필드를 추가해 기존 임의 값이 제한되는 경우도 검토 대상으로 잡는다. 닫힌 객체의 선택 필드 추가와 enum 확장은 기존처럼 허용한다.

multipleOf, prefixItems, unevaluated 계열 등은 보수적으로 변경을 감지한다. 해석하지 않는 키워드의 변경은 호환성을 입증하지 못했다고 보고한다. 이 검사는 JSON Schema 포함 관계를 완전히 증명하는 결정 절차가 아니므로, 중복되거나 논리적으로 동치인 새 제약도 검토를 요구할 수 있다.

enum/const의 실제 payload에서 description·x-* 같은 이름을 annotation으로 지워 비교하던 경로도 제거한다. 알려진 schema 위치의 annotation-only 변경은 허용하고 properties map의 실제 이름은 보존한다.

기존 통합 회귀를 유지하고 새 제약·리터럴 값·annotation·unsupported keyword 단위 회귀를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았다.

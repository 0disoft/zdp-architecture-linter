# 인덱스 생성 전 중복 식별자 차단

검토 항목 6이며 핵심 카탈로그 preflight PR 다음에 적용한다. repository name과 서비스·저장소·이벤트·제공자·운영 자산 등 카탈로그 id를 인덱스와 같은 trim 규칙으로 비교한다. 뒤에 나온 중복마다 ZDP-CATALOG-ID-001을 반환하고 첫 선언 위치를 제시한다.

사전 검사 오류가 있으면 ValidationContext.getGraph도 실패하도록 하여 호출자가 preflight 검사를 생략해도 잘못된 그래프를 만들지 못하게 한다. 정상적인 context는 graph promise를 계속 한 번만 생성한다. low-level 순수 evaluator와 직접 구성한 거짓 preflight 객체는 검증된 입력을 받는 내부 계약을 유지한다.

공통 사전 검사를 통과한 입력만 diff에 넣는 동작은 별도 diff preflight PR과 함께 적용한다. 중복 정규화·대소문자 구분·graph admission 회귀 테스트를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았다.

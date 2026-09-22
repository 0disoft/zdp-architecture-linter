# 핵심 카탈로그 구조 사전 검사

검토 항목 5이며 정책 입력 preflight PR 다음에 적용한다. services, datastores, split triggers, cost budgets, SLO tiers의 reader 입력 구조를 공통 사전 검사에 포함한다. services/datastores 항목은 객체와 비어 있지 않은 id를 요구한다. 정상적인 빈 목록은 계속 허용한다.

서비스 계약용 service.schema.json을 형태가 다른 services 카탈로그에 잘못 적용하지 않는다. 기존의 repository/data-class/event/provider/operational-asset/support-adapter 정식 schema 검증은 유지한다. 이 PR은 기존 reader의 최소 구조 계약을 검증하며 중앙 원천에 없는 정책 값이나 전체 카탈로그 schema를 새로 정의하지 않는다.

사전 검사 오류는 ZDP-CATALOG-SHAPE-001이며 graph 등 기존 preflight 소비 명령이 빈 그래프로 성공하는 경로를 차단한다. 직접 구조 테스트와 실제 graph CLI 실패 테스트를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았다.

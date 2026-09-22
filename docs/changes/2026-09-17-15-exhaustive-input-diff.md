# 모든 로드된 정책 입력 변경 보고

검토 항목 15이며 diff 텍스트 개선 PR 다음에 적용한다. 기존 changes 계약을 유지하면서 inputChanges를 추가한다. 외부 제공자·데이터 클래스·비용 예산·SLO·support adapter·선택적 정책·로드맵을 포함한 ArchitectureCatalogs의 모든 필드를 추적한다.

타입으로 완전성을 검사하는 ARCHITECTURE_INPUTS 메타데이터에 원천 파일과 collection identity를 선언한다. 새 loader 필드 추가 시 매핑 누락은 typecheck에서 실패하며 실제 loader 출력과의 키 일치도 회귀 테스트로 확인한다. 일반 정책 값과 정의되지 않은 root metadata 변경도 필드명으로 보고하되 원본 값을 출력하지 않는다.

ID가 있는 top-level collection은 순서 변경을 무시하고 added/removed/changed ID를 표시한다. nested array의 의미를 임의로 추정해 정렬하지는 않는다. JSON Schema 파일은 loader catalog와 별개이며 이벤트 compatibility와 후속 provenance manifest에서 다룬다.

원천별 회귀·순서 변경·정책 metadata·text 연결 테스트를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았다.

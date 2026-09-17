# 입력 읽기 루트 경계

검토 항목 10이며 이벤트 비교 분리 PR 다음에 적용한다. 카탈로그·규칙·로드맵, 공통 schema cache의 모든 production 호출자, service.yaml, service/support fixture, 이벤트 schema_ref와 재귀 로컬 $ref, 이벤트 호환성 schema와 migration Markdown 읽기에 선택된 루트의 realpath 경계를 적용한다. 내부 링크는 허용하고 외부 파일·디렉터리 링크와 junction은 거절한다.

파일은 regular-file descriptor를 열어 확인한 뒤 읽고, 열린 객체와 다시 확인한 경로의 identity가 달라지면 실패한다. cache hit 이전에도 경계를 재검사한다. 범용 compileJsonSchemaFile API의 allowedRoot 생략은 기존 호환성을 위해 유지하지만 production architecture 호출자는 모두 명시한다.

이 변경을 운영체제 샌드박스나 동시 파일 변경에 대한 완전한 보장으로 해석하면 안 된다. 안전한 CI 비교는 불변 Git 스냅샷에서 실행해야 한다. 저장소 전용 custom gate 전체의 파일 접근을 이번 PR에서 일괄 감사하지는 않았다. 선택적 파일의 기존 ENOENT 의미는 유지한다.

내부/외부 링크, junction, 캐시 재검사와 실제 catalog loader 회귀 테스트를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았으며 PR CI 확인이 필요하다. 개별 repository schema 진단 PR과 병합 시 allowedRoot 전달을 함께 보존해야 한다.

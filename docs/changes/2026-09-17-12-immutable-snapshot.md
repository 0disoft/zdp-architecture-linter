# 불변 Git 스냅샷

검토 항목 12의 구현이며 항목 11의 파일명 보존 PR 다음에 적용한다.

스냅샷 생성 전에 ref를 commit OID로 한 번 확정한다. 파일 목록과 파일 내용은 모두 그 OID에서 읽고, 결과에 requestedRef와 resolvedRef를 남긴다. annotated tag도 commit으로 해제하며 commit이 아닌 객체와 비정상 OID는 거절한다.

태그 해제, 원본 태그 이동 후 스냅샷 유지, blob ref 거절 테스트를 추가했다. 실제 동시 ref 변경을 주입하는 테스트는 추가하지 않았으며, 각 읽기에 확정 OID만 전달하는 코드 경계로 일관성을 보장한다. 로컬 typecheck/full-test intent는 mustflow/Bun 환경 부재로 실행하지 않았다.

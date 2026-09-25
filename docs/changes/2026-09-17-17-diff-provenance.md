# diff 검증 이력과 입력 해시

검토 항목 17이며 명시적 diff source PR 다음에 적용한다. CLI 비교 시작 시 observedAt을 한 번 정하고 양쪽 운영 자산 사전 검사와 상태 전이 증거 검사에 전달한다. 보고서에는 UTC 시각, package.json의 실제 버전, Bun 버전, 요청 ref, 실제 snapshot을 만든 commit OID, 입력·정책·schema SHA-256을 기록한다.

입력 manifest는 catalogs/rules/schemas/fixtures/docs/adr/ROADMAP.md의 정확한 파일 bytes를 경로와 함께 해시한다. 범위는 보고서에도 명시한다. 내용이나 호스트 절대 경로를 출력하지 않는다. 최대 50,000개·256 MiB이며 스트리밍으로 읽는다. worktree는 검증 전후 manifest가 다르면 실패한다. 전후 동일성을 확인하는 방식은 악의적인 ABA 변경까지 막는 OS snapshot 보장이 아니므로 엄격한 재현은 Git commit 비교를 사용한다.

원본 ref를 OID로 확정한 후 그 OID로 snapshot을 생성한다. 기존 snapshot API에서도 기록된 commit과 실제 입력이 일치하며, immutable snapshot PR과 함께 적용하면 ref 확정이 한 번 추가될 수 있다. 공통 root-bound-input.ts는 #25의 동일 blob을 재사용한다. 사전 검사 변경과 병합 시 observedAt 전달과 새 정책/ID 검사를 모두 보존한다.

manifest 변화·분리 해시·고정 시점 증거 판정·실제 Git CLI provenance 회귀를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았다.

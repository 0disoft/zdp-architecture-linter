# 명시적 diff 입력 경로

검토 항목 16이다. createArchitectureDiffReport는 sourceRoots로 base/head 원본 경로를 받으며 객체 identity나 WeakMap을 조회하지 않는다. 복사한 catalog도 명시한 경로에 대해 같은 이벤트 호환성 검사를 실행한다.

sourceRoots가 없는 라이브러리 호출은 eventSchemaCompatibility.status=not_run과 이유를 반환한다. 빈 진단 배열을 검사 성공으로 해석하면 안 된다. CLI는 경로를 항상 전달하며 checked가 아니면 exit 1이다. 잘못된 경로는 실패한다. 기존 source-root 등록 API는 외부 호출자 호환을 위해 남겨 두지만 결과 계산에는 사용하지 않는다.

선행 PR #19와 #27의 변경만 합친 review/diff-foundation을 base로 사용한다. 이 PR의 diff에는 항목 16만 들어 있다. 두 선행 계열이 main에 병합되면 base를 main으로 변경한다. 이 작업 중 main이나 기존 PR은 병합하지 않았다.

복제 입력·명시적 경로·not_run·기존 등록 무시 회귀 테스트를 추가했다. 로컬 mustflow/Bun 부재로 typecheck/full-test intent는 실행하지 않았다.

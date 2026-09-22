# 제한된 Git 배치 읽기

검토 항목 13이며 항목 11, 12 위에 적용한다. 파일마다 git show를 생성하던 경로를 ls-tree --long 한 번과 cat-file --batch 한 번으로 바꾼다. 같은 blob은 한 번만 읽고 NUL 경로와 바이너리 payload를 그대로 보존한다.

기본 상한은 파일 50,000개, 파일당 50 MiB, 전체 256 MiB, Git 프로세스별 30초다. 라이브러리 호출은 limits로 명시적으로 조절할 수 있다. 잘린 출력, 예상하지 못한 객체, 크기 불일치, 목적지 별칭, symlink와 submodule은 실패하며 임시 스냅샷을 정리한다.

프로세스 수 감소는 구현으로 확인할 수 있지만 실제 속도 개선 수치는 측정하지 않았다. 새 parser 테스트와 기존 실제 Git 스냅샷 테스트가 통합 경로를 확인한다. 로컬 mustflow/Bun이 없어 typecheck/full-test 및 성능 측정 intent는 실행하지 않았다.

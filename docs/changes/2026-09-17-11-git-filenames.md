# Git 스냅샷 파일명 보존

검토 항목 11의 구현이다. ls-tree를 -z로 호출하고 NUL로 경로를 구분한다. trim과 줄바꿈 분리, 역슬래시의 묵시적 경로 구분자 변환을 제거한다. 잘못된 UTF-8은 다른 이름으로 바꾸지 않고 오류로 처리한다.

Windows에서 표현할 수 없는 이름, 예약 장치명, 끝 공백·마침표, drive-relative 경로는 명시적으로 거절한다. 정상 한글·공백 파일명은 실제 Git 저장소 회귀 테스트로 검증하도록 추가했다.

기존 traversal 차단과 Git 실행 hardening은 유지한다. 로컬 mustflow/Bun 환경 부재로 typecheck/full-test intent를 실행하지 않았으며 CI 확인이 필요하다.

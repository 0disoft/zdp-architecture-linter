# Runbook

## 상태 확인

- `zdp_architecture_linter_typecheck`로 TypeScript 소스 타입 계약을 확인한다.
- `zdp_architecture_linter_full_test`로 규칙, fixture, CLI 출력 회귀를 확인한다.
- `zdp_architecture_validate_architecture_linter_repository`로 이 저장소 루트가 중앙 아키텍처 정책을 통과하는지 확인한다.
- `zdp_architecture_validate_fast`로 중앙 `zdp-architecture` 카탈로그와 계약이 현재 linter 기준을 통과하는지 확인한다.
- 사람과 CI는 `bun run validate:self-contained`로 sibling checkout 없이 CLI와 이 저장소 계약의 통합 경로를 빠르게 확인할 수 있다. 이 결과는 중앙 정책 통과 증거가 아니다.
- 저장소 단위 검증은 root mustflow command contract에 등록된 `zdp_architecture_validate_*_repository` intent를 사용한다.
- Registry 출력 계약을 바꾸거나 `generated/registry.json` 동기화가 필요하면 `zdp_architecture_registry_check`로 확인한다.

## 변경 절차

- 새 규칙은 `zdp-architecture`의 문서, 스키마, 카탈로그, 규칙 파일, fixture 중 하나를 원천으로 둔다.
- 규칙 ID, 실패 조건, 진단 메시지를 먼저 고정한 뒤 구현과 테스트를 맞춘다.
- 경고에서 오류로 올리는 변경은 기존 저장소가 왜 실패해야 하는지 근거를 남긴다.
- CLI JSON 출력에 새 진단이 추가되면 관련 테스트와 README, CHANGELOG를 함께 갱신한다.
- loader 필수 입력이나 repository/service reference wiring이 바뀌면 `fixtures/self-architecture`도 최소 범위로 갱신한다. 중앙 정책 문구나 전체 catalog를 복사하지 않는다.

## 장애 대응

- `validate:self-contained`가 실패하면 실제 저장소 파일 drift와 fixture wiring drift를 먼저 구분한다.
- 중앙 아키텍처 검증이 갑자기 실패하면 새 규칙이 원천 문서보다 넓게 잡는지 먼저 확인한다.
- 저장소 검증이 `service.yaml` schema 단계에서 실패하면 baseline 규칙보다 schema/catalog 동기화 문제를 먼저 고친다.
- CLI가 JSON을 깨뜨리면 마지막 정상 커밋의 `zdp_architecture_linter_full_test` receipt와 현재 diff를 비교한다.

## 롤백

- 규칙 강화가 잘못된 차단을 만들면 규칙 조건과 테스트 fixture를 함께 되돌린다.
- 진단 ID를 제거하거나 의미를 바꿀 때는 README와 CHANGELOG에서 해당 ID 설명도 같이 되돌린다.
- 이미 배포된 CLI 출력 호환성이 깨졌다면 새 ID를 보존하고 조건만 좁힌다.
- self-contained CI가 과도한 정책 복제로 커지면 해당 정책 복제를 제거하고 canonical intent 검증으로 되돌린다.

## 재검증

- `zdp_architecture_linter_typecheck`
- 변경 영역의 focused rules test intent
- CLI 출력, fixture, 진단 ID, registry 출력 계약 변경 시 `zdp_architecture_linter_full_test`
- `zdp_architecture_validate_architecture_linter_repository`
- 필요 시 변경 대상 저장소별 `zdp_architecture_validate_*_repository` intent

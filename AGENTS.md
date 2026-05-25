# AGENTS.md

## 역할

이 저장소는 ZDP 아키텍처 작업을 위한 정책·카탈로그 검증기인 `zdp-architecture-linter`를 구현한다.

정책의 원천은 `zdp-architecture` 문서 저장소다. 이 저장소에서 플랫폼 정책을 임의로 새로 만들지 않는다. 규칙이 빠져 있거나 불명확하면 먼저 `zdp-architecture`를 수정하거나 수정 필요 사항을 남긴 뒤, 여기서는 그 기준을 검증기로 구현한다.

## 읽는 순서

1. `AGENTS.md`
2. `README.md`
3. 이 저장소의 관련 소스 파일
4. `zdp-architecture`의 관련 원천 파일

주요 `zdp-architecture` 입력은 다음과 같다.

- `schemas/service.schema.json`
- `catalogs/repositories.yaml`
- `catalogs/services.yaml`
- `catalogs/datastores.yaml`
- `catalogs/data-classes.yaml`
- `catalogs/events.yaml`
- `rules/*.yaml`
- `fixtures/pass/**`
- `fixtures/fail/**`
- `docs/24-service-contract.md`
- `docs/30-platform-registry-cli.md`

## 작업 규칙

- 검증 규칙은 문서, 스키마, 카탈로그, 규칙 파일, fixture 중 하나로 추적 가능해야 한다.
- 규칙 식별자, 진단 메시지, 실패 조건은 명시적이고 재현 가능하게 작성한다.
- 파싱, 그래프 구성, 규칙 평가, CLI 출력, 테스트 fixture를 분리한다.
- 동작이 바뀌면 관련 fixture를 추가하거나 수정한다.
- 돈, 권한, 개인정보, AI 사용자 데이터, 인증 정보, 감사 경계는 보수적으로 차단한다.
- 구현이 번거롭다는 이유로 차단 규칙을 경고로 낮추지 않는다.
- 카탈로그에서 읽을 수 있는 ZDP 저장소 목록을 코드에 하드코딩하지 않는다.
- 생성물은 생성 원천과 명령이 문서화된 경우에만 추가한다.

## 문서 규칙

- 문서는 한국어로 작성한다. 기계가 읽는 계약 파일이나 기존 파일 형식이 영어를 요구하는 경우만 예외로 둔다.
- 이 저장소의 동작이 `zdp-architecture`에 의존하면 정책 문구를 길게 복사하지 말고 원천 파일명을 명시한다.
- 구현 중 빠진 아키텍처 규칙을 발견하면 가능하면 같은 논리 단위에서 `zdp-architecture`도 함께 수정한다.

## 현재 범위

첫 사용 가능 버전은 다음에 집중한다.

- 아키텍처 카탈로그, 스키마, 규칙, fixture 읽기
- 저장소 카탈로그 필수 필드 검증
- `service.yaml` 스키마 검증
- 서비스, 저장소, 데이터 저장소, 데이터 클래스, 이벤트, 외부 제공자 참조 검증
- 생성하면 안 되는 저장소 단계를 실제 배포 저장소처럼 다루는 실수 차단
- money, core, privacy, credential, AI 경계를 넘는 직접 데이터 저장소 접근 차단
- 로컬 개발과 CI에서 사용할 수 있는 안정적인 CLI 출력 제공


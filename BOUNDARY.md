# Boundary

## 소유하는 것

- ZDP 아키텍처 카탈로그와 서비스 계약을 읽는 검증 CLI
- repository, service, datastore, data class, event, provider 참조 무결성 검사
- 실제 저장소 루트의 baseline 파일과 root Markdown 계약 검사
- 정책 위반을 사람이 고칠 수 있는 진단 메시지로 출력하는 규칙
- graph, normalize, explain, pack, diff, doctor, list CLI 출력

## 소유하지 않는 것

- `zdp-architecture` 정책 원천 문서와 카탈로그의 최종 의사결정
- 제품 저장소 생성기와 템플릿 생성기
- 실제 배포, secret 관리, 결제 연동, provider API 호출
- 제품 런타임 권한 판단, 개인정보 접근 중개, credential 보관
- 운영 데이터, 고객 payload, private incident record

## 직접 접근 가능한 것

- 선택된 `zdp-architecture` 루트 아래의 문서, 스키마, 카탈로그, 규칙, fixture
- 선택된 repository root 아래의 루트 계약 파일과 검사 대상 파일
- 이 저장소의 `src/`, `tests/`, README, CHANGELOG, package metadata

## API로만 접근할 대상

- GitHub, Cloudflare, provider, billing, database, observability 계정
- core, money, privacy, credential, comm, AI 런타임 데이터
- 실제 운영 배포 상태와 secret backend

## 분리 트리거

- linter가 배포, secret, GitHub repository 생성, provider 호출까지 포함하려고 할 때는 별도 운영 도구로 분리한다.
- 아키텍처 registry 생성물이 제품 런타임 입력으로 직접 쓰이기 시작하면 계약 export 저장소와 실행 runtime을 분리한다.
- 검증 규칙이 특정 도메인 구현 세부사항을 과도하게 품기 시작하면 해당 플랫폼 저장소의 repo-local checker로 이동한다.

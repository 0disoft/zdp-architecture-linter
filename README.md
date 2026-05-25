# zdp-architecture-linter

ZDP 아키텍처 카탈로그와 서비스 계약을 검증하는 CLI 저장소다.

정책의 원천은 `zdp-architecture` 문서 저장소다. 이 저장소는 그 원천을 읽어 검증 가능한 규칙으로 실행한다.

## 목표

- `service.yaml`이 `schemas/service.schema.json`을 따르는지 검사한다.
- `catalogs/**/*.yaml` 사이의 참조 무결성을 검사한다.
- 데이터 클래스를 선언한 서비스가 데이터 소유자와 저장소를 함께 밝히고, 중앙 카탈로그에 존재하는 데이터 클래스와 저장소만 참조하는지 검사한다.
- `repo_stage`, `kind`, `owner`, `risk_level` 같은 저장소 필수 필드를 검사한다.
- 논리 경계나 금지 후보를 실제 배포 저장소처럼 다루는 실수를 막는다.
- 제품, 웹, 실험 저장소가 core, money, privacy, credential, ledger 데이터 저장소를 직접 읽는 구조를 막는다.
- AI 사용자 데이터 접근, 민감 AI 데이터의 모델 제공자 보관·학습 정책, 결제·크레딧 데이터 소유 경계, 외부 제공자, 웹훅 서명·재처리, 감사, 티어별 운영 기준의 차단 규칙을 실행한다.
- 저장소, 서비스, 데이터 저장소, 데이터 클래스, 이벤트, 외부 제공자 사이의 선언된 관계를 그래프 간선으로 출력한다.
- 실패 이유를 사람이 고칠 수 있는 진단 메시지로 출력한다.

## 하지 않는 일

- 새로운 ZDP 정책을 이 저장소에서 임의로 정하지 않는다.
- 제품 저장소 생성기나 템플릿 생성기를 겸하지 않는다.
- GitHub 저장소 생성, 배포, 비밀값 관리, 결제 연동을 수행하지 않는다.
- README만 보고 저장소 생성 가능 여부를 판단하지 않는다. 기계 판단은 카탈로그, 스키마, 규칙, fixture를 기준으로 한다.

## 현재 명령

현재 구현된 첫 CLI 표면은 아래와 같다.

```txt
zdp-arch validate --architecture <path>
zdp-arch validate --architecture <path> --repository <path>
zdp-arch validate --architecture <path> --json
zdp-arch graph --architecture <path> --json
zdp-arch graph --architecture <path> --repository <path> --json
zdp-arch explain --architecture <path> --repository <path> --json
```

## 입력 원천

`zdp-architecture`에서 읽을 주요 입력은 다음과 같다.

```txt
catalogs/repositories.yaml
catalogs/services.yaml
catalogs/datastores.yaml
catalogs/data-classes.yaml
catalogs/events.yaml
schemas/service.schema.json
rules/*.yaml
rules/repository.rules.yaml
fixtures/pass/**
fixtures/fail/**
```

## 구현 순서

1. 카탈로그와 스키마 로더를 만든다. `[진행 중]`
2. repository catalog 필수 필드 검사를 구현한다. `[완료]`
3. service repo 참조 검사와 배포 불가 repo_stage 차단을 구현한다. `[완료]`
4. fixture 기반 통과/실패 테스트를 넓힌다. `[진행 중]`
5. 정규화된 저장소, 서비스, 데이터 저장소 그래프와 선언된 관계 간선을 만들고 CLI에서 확인할 수 있게 한다. `[진행 중]`
6. `service.yaml` 스키마 검사를 구현한다. `[진행 중]`
7. 참조 무결성 검사를 데이터 저장소, 데이터 클래스, 이벤트, 외부 제공자로 확장한다. `[진행 중]`
8. 돈, 권한, 개인정보, AI, credential, provider, tier 규칙을 차례로 붙인다. `[진행 중]`

## 현재 상태

저장소 부트스트랩, repository catalog 필수 필드 검사, repository 이름 접두어와 area 매핑 검사, 정규화된 아키텍처 그래프의 첫 구조와 `graph` CLI 출력, 서비스·데이터 저장소·데이터 클래스·이벤트·외부 제공자 관계 간선 출력, 진단에 관련 그래프 관계를 붙이는 `explain` CLI 출력, service repo 참조 검사, 서비스 의존성 참조 검사, 데이터 저장소 참조 검사, 데이터 클래스 참조 검사, 데이터 클래스 선언 서비스의 카탈로그 참조·소유자·저장소 계약 검사, 이벤트 참조 검사, 외부 제공자 참조 검사, 제품·웹·실험 저장소의 민감 데이터 저장소 직접 접근 차단, 제품·프론트엔드 저장소의 원장 데이터 저장소 의존성 차단, AI 사용자 데이터 접근의 privacy broker·감사·권한 모델 검사, 민감 AI 데이터의 학습 제외와 무보관 또는 보관 예외 검사, AI 서비스의 비소유 데이터 저장소 직접 접근 차단, 엣지 런타임의 상태 저장소 직접 접근 차단, 금전 이동 서비스의 tier0·감사·멱등성·money 의존성 검사, 결제 데이터를 프론트엔드·lab 저장소가 직접 소유하는 구조 차단, 크레딧 과금의 공통 지갑·money ledger 소유 경계 검사, 외부 제공자 계약의 전송 데이터·비밀값 소유자·허용 환경 검사, 웹훅 제공자의 서명 검증·재처리 가능성 선언 검사, tier2 이상 서비스의 기본 운영 계약 검사, tier0 서비스의 불변 감사·비상 접근·키 소유자 검사, 공개·파트너 API의 OpenAPI·버전·속도 제한·폐기 정책 검사, fixture 통과·실패 기대값 검사, `service.schema.json` 기반 service 계약 fixture 검사, 실제 저장소 루트의 `service.yaml` 스키마 검사와 `service.repo` 카탈로그 참조 검사, `service.id`의 중앙 서비스 카탈로그 등록 검사, 실제 `service.yaml`의 데이터 클래스·데이터 저장소·외부 제공자·이벤트 참조 검사, 실제 `service.yaml`의 데이터 접근·money·provider·AI·tier·public API 정책 검사는 구현됐다. 현재 `zdp-architecture`의 실제 카탈로그와 fixture는 `ZDP-REPO-001`, `ZDP-REPO-002`, `ZDP-REPO-003`, `ZDP-REF-001`, `ZDP-REF-002`, `ZDP-REF-003`, `ZDP-REF-004`, `ZDP-REF-005`, `ZDP-REF-006`, `ZDP-REF-007`, `ZDP-REF-008`, `ZDP-REF-009`, `ZDP-DATA-001`, `ZDP-DATA-002`, `ZDP-DATA-003`, `ZDP-DATA-005`, `ZDP-AI-001`, `ZDP-AI-002`, `ZDP-AI-003`, `ZDP-DATA-004`, `ZDP-MONEY-001`, `ZDP-MONEY-002`, `ZDP-MONEY-003`, `ZDP-PROVIDER-001`, `ZDP-PROVIDER-002`, `ZDP-TIER-001`, `ZDP-TIER-002`, `ZDP-API-001`, `ZDP-SERVICE-SCHEMA-001`, `ZDP-SERVICE-SCHEMA-002`, `ZDP-SERVICE-SCHEMA-003`, `ZDP-SERVICE-SCHEMA-004` 기준을 통과한다.

## 개발 명령

```txt
bun install
bun run check
bun test
bun src/cli.ts validate --architecture <zdp-architecture-path> --json
bun src/cli.ts validate --architecture <zdp-architecture-path> --repository <repo-path> --json
bun src/cli.ts graph --architecture <zdp-architecture-path> --json
bun src/cli.ts graph --architecture <zdp-architecture-path> --repository <repo-path> --json
bun src/cli.ts explain --architecture <zdp-architecture-path> --repository <repo-path> --json
```

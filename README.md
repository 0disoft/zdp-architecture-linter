# zdp-architecture-linter

ZDP 아키텍처 카탈로그와 서비스 계약을 검증하는 CLI 저장소다.

정책의 원천은 `zdp-architecture` 문서 저장소다. 이 저장소는 그 원천을 읽어 검증 가능한 규칙으로 실행한다.

## 목표

- `service.yaml`이 `schemas/service.schema.json`을 따르는지 검사한다.
- `catalogs/**/*.yaml` 사이의 참조 무결성을 검사한다.
- `repo_stage`, `kind`, `owner`, `risk_level` 같은 저장소 필수 필드를 검사한다.
- 논리 경계나 금지 후보를 실제 배포 저장소처럼 다루는 실수를 막는다.
- 제품, 웹, 실험 저장소가 core, money, privacy, credential, ledger 데이터 저장소를 직접 읽는 구조를 막는다.
- AI 사용자 데이터 접근, 외부 제공자, 웹훅, 감사, 티어별 운영 기준의 차단 규칙을 실행한다.
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
zdp-arch validate --architecture <path> --json
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
fixtures/pass/**
fixtures/fail/**
```

## 구현 순서

1. 카탈로그와 스키마 로더를 만든다. `[진행 중]`
2. repository catalog 필수 필드 검사를 구현한다. `[완료]`
3. service repo 참조 검사와 배포 불가 repo_stage 차단을 구현한다. `[완료]`
4. fixture 기반 통과/실패 테스트를 넓힌다.
5. 정규화된 저장소, 서비스, 데이터 저장소 그래프를 만든다.
6. `service.yaml` 스키마 검사를 구현한다.
7. 참조 무결성 검사를 데이터 저장소, 데이터 클래스, 이벤트, 외부 제공자로 확장한다. `[진행 중]`
8. 돈, 권한, 개인정보, AI, credential, provider, tier 규칙을 차례로 붙인다. `[진행 중]`

## 현재 상태

저장소 부트스트랩, repository catalog 필수 필드 검사, service repo 참조 검사, 서비스 의존성 참조 검사, 데이터 저장소 참조 검사, 데이터 클래스 참조 검사, 이벤트 참조 검사, 외부 제공자 참조 검사, 제품·웹·실험 저장소의 민감 데이터 저장소 직접 접근 차단, AI 서비스의 비소유 데이터 저장소 직접 접근 차단, 엣지 런타임의 상태 저장소 직접 접근 차단은 구현됐다. 현재 `zdp-architecture`의 실제 카탈로그는 `ZDP-REPO-001`, `ZDP-REPO-002`, `ZDP-REF-001`, `ZDP-REF-002`, `ZDP-REF-003`, `ZDP-REF-004`, `ZDP-REF-005`, `ZDP-REF-006`, `ZDP-REF-007`, `ZDP-REF-008`, `ZDP-DATA-001`, `ZDP-AI-003`, `ZDP-DATA-004` 기준을 통과한다.

## 개발 명령

```txt
bun install
bun run check
bun test
bun src/cli.ts validate --architecture <zdp-architecture-path> --json
```

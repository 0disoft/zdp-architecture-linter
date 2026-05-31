# zdp-architecture-linter

ZDP 아키텍처 카탈로그와 서비스 계약을 검증하는 CLI 저장소다.

정책의 원천은 `zdp-architecture` 문서 저장소다. 이 저장소는 그 원천을 읽어 검증 가능한 규칙으로 실행한다.

## 목표

- `service.yaml`이 `schemas/service.schema.json`을 따르는지 검사한다.
- `catalogs/events.yaml`이 `schemas/event.schema.json`을 따르는지 검사한다.
- 이벤트 `schema_ref`가 `schemas/events/*.json` 아래의 실제 JSON Schema 파일을 가리키고, 해당 파일의 `$id`가 참조 경로와 일치하는지 검사한다.
- `catalogs/**/*.yaml` 사이의 참조 무결성을 검사한다.
- 데이터 클래스를 선언한 서비스가 데이터 소유자와 저장소를 함께 밝히고, 중앙 카탈로그에 존재하는 데이터 클래스와 저장소만 참조하는지 검사한다.
- 실제 `service.yaml`이 이벤트를 생산할 때 중앙 이벤트 카탈로그의 `schema_ref`와 같은 payload 계약을 쓰는지 검사한다.
- 실제 `service.yaml`이 재처리나 실패 큐가 필요한 이벤트를 참조할 때 운영 계약을 함께 밝히는지 검사한다.
- 후보 공개 도메인이 실제 공개 도메인이나 정본 도메인으로 선언되는 실수를 막는다.
- `repo_stage`, `kind`, `owner`, `risk_level` 같은 저장소 필수 필드를 검사한다.
- 실제 저장소 루트에 `.editorconfig`, `.gitattributes`, `AGENTS.md`, `README.md` 같은 기본 파일이 있는지 검사한다.
- 실험 저장소 루트에 실험 가설과 종료 기준을 담는 `EXPERIMENT.md`가 있는지 검사한다.
- 패키지, CLI, SDK, 템플릿 성격의 저장소 루트에 `CONTRIBUTING.md`와 `CHANGELOG.md`가 있는지 검사한다.
- 공개 정적 웹 저장소 루트에 `webpub.toml`이 있고, 후보 도메인과 robots 차단 정책이 `service.yaml`과 어긋나지 않는지 검사한다.
- `zdp-core-platform` 저장소 루트의 core boundary, command envelope, audit event, consent record 계약 파일이 구현 전 gate로 유지되는지 검사한다.
- `zdp-web-apps` 저장소 루트의 app shell 계약과 SvelteKit route skeleton이 platform truth를 소유하지 않는지 검사한다.
- `zdp-platform-runtime` 저장소 루트의 health/readiness, `core-api`/`app-console`/`edge-webhook-ingress` smoke target, deployment template, rollback 계약과 smoke runner skeleton이 배포 전 gate로 유지되는지 검사한다.
- `zdp-data-platform` 저장소 루트의 analytics ingest, ClickHouse storage, deletion/anonymization 계약, architecture-aware checker skeleton, validator-only runtime skeleton이 GA4 대체 분석 gate로 유지되는지 검사한다.
- `zdp-edge-workers` 저장소 루트의 request boundary, webhook ingress, queue envelope, analytics ingress 계약과 data-platform runtime-compatible precheck source/test가 Worker 구현 전 gate로 유지되는지 검사한다.
- `zdp-platform-observability` 저장소 루트의 telemetry convention, dashboard inventory, alert rule 계약과 checker skeleton이 provider 연결 전 gate로 유지되는지 검사한다.
- `zdp-platform-infra` 저장소 루트의 resource inventory, environment schema, backup/restore 계약이 provider 연결 전 gate로 유지되는지 검사한다.
- `zdp-data-platform` 저장소 루트의 analytics ingest, ClickHouse storage, deletion/anonymization 계약과 architecture-aware checker skeleton이 GA4 대체 구현 전 gate로 유지되는지 검사한다.
- `zdp-growth-lab` 저장소 루트의 funnel metric, growth experiment, experiment safety 계약과 checker skeleton이 CAC/LTV/CLV 정본이나 직접 DB 조회로 번지지 않는지 검사한다.
- `zdp-privacy-access-broker` 저장소 루트의 privacy access policy, capability grant, data minimization 계약이 raw token, raw source payload, subject-level analytics stream, 제품 권한·이용권·원장 판단으로 번지지 않는지 검사한다.
- `zdp-money-platform` 저장소 루트의 billing/payments/ledger/risk boundary, money command envelope, append-only ledger entry, payment webhook, entitlement-credit 계약과 checker skeleton이 제품 저장소의 잔액 변경, 중복 웹훅 반영, raw 결제 데이터 저장으로 번지지 않는지 검사한다.
- 논리 경계나 금지 후보를 실제 배포 저장소처럼 다루는 실수를 막는다.
- 조건부 배포 저장소가 생성 조건을 밝히지 않는 경우 경고한다.
- 예약된 배포 저장소가 로드맵 근거 없이 초기 생성 후보처럼 남는 경우 경고한다.
- 분리 대상 저장소가 카탈로그에 없거나, 분리 조건이 2개 이상 충족된 경계가 독립 저장소 후보 검토 없이 남는 경우 경고한다.
- `notes`에 최신 외부 확인 정책이 숨어 있는데 기계 필드가 없는 경우 경고한다.
- `notes`에 생성 순서, 생성 조건, 금지 정책, 공개 전환 정책이 숨어 있는데 기계 필드가 없는 경우 경고한다.
- 위험 표면이 있는 tier3 실험이 비용·종료·관측성 기준을 밝히지 않는 경우 경고한다.
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
zdp-arch pack --architecture <path> --repo <repo> --task <task> [--out generated/llm/task-pack.md [--check]] --json
zdp-arch check-split --architecture <path> --json
zdp-arch diff --architecture <path> --base <git-ref> [--head <git-ref|worktree>] --json
zdp-arch doctor --architecture <path> [--repository <path>] --json
zdp-arch normalize --architecture <path> [--repository <path>] [--out generated/registry.json [--check]] --json
zdp-arch list repos --architecture <path> [--stage <repo_stage>] [--area <area>] --json
zdp-arch list services --architecture <path> [--repo <repo>] --json
```

## 입력 원천

`zdp-architecture`에서 읽을 주요 입력은 다음과 같다.

```txt
catalogs/repositories.yaml
catalogs/split-triggers.yaml
catalogs/services.yaml
catalogs/datastores.yaml
catalogs/data-classes.yaml
catalogs/events.yaml
ROADMAP.md
docs/26-eighteen-month-roadmap.md
schemas/service.schema.json
schemas/event.schema.json
schemas/events/*.json
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

저장소 부트스트랩, repository catalog 필수 필드 검사, repository 이름 접두어와 area 매핑 검사, 실제 저장소 루트의 기본 파일 검사, 실험 저장소 루트의 `EXPERIMENT.md` 검사, 패키지·CLI·SDK·템플릿 저장소 루트의 `CONTRIBUTING.md`와 `CHANGELOG.md` 검사, 공개 정적 웹 저장소 루트의 `webpub.toml` 후보 발행 계약 검사, `zdp-core-platform` 저장소 루트의 core 계약 gate 검사, `zdp-web-apps` 저장소 루트의 app shell 계약 gate 검사, `zdp-platform-runtime` 저장소 루트의 runtime smoke 계약 gate 검사, `zdp-edge-workers` 저장소 루트의 edge와 analytics ingress 계약 및 data-platform runtime-compatible source/test gate 검사, `zdp-platform-observability` 저장소 루트의 observability 계약과 checker skeleton gate 검사, `zdp-platform-infra` 저장소 루트의 infra 계약 gate 검사, `zdp-data-platform` 저장소 루트의 analytics ingest, ClickHouse storage, deletion/anonymization 계약, architecture-aware checker skeleton, validator-only runtime skeleton gate 검사, `zdp-growth-lab` 저장소 루트의 funnel metric, growth experiment, experiment safety 계약과 checker skeleton gate 검사, `zdp-privacy-access-broker` 저장소 루트의 privacy access policy, capability grant, data minimization 계약 gate 검사, `zdp-money-platform` 저장소 루트의 money boundary, command envelope, ledger entry, payment webhook, entitlement-credit 계약과 checker skeleton gate 검사, 조건부 배포 저장소의 `create_when` 누락 경고, 예약 배포 저장소의 로드맵 근거 누락 경고, 분리 대상 저장소 등록과 독립 저장소 후보 검토 경고, `lab_only + kind: lab` 저장소의 실험 서비스 계약 허용, `check-split` CLI 출력, 저장소 작업 맥락을 압축하는 `pack` CLI 출력, `generated/llm/task-pack.md` 쓰기와 최신성 검사, Git 기준점과 현재 작업 트리 또는 다른 Git 기준점 사이의 카탈로그 핵심 ID 변화와 진단 변화량을 보여주는 `diff` CLI 출력, 필수 원천 파일·카탈로그 로딩·검증 결과·Git 작업 트리·생성물 경계·선택 저장소의 `service.yaml` 상태를 읽기 전용으로 점검하는 `doctor` CLI 출력, 저장소·서비스·데이터 저장소·데이터 클래스·이벤트·외부 제공자 노드와 그래프 간선, 검증 요약을 안정적인 JSON 형태로 펴는 `normalize` CLI 출력, `generated/registry.json` 쓰기와 최신성 검사, 저장소와 서비스를 필터링해 조회하는 `list repos/services` CLI 출력, `notes` 최신성 정책의 기계 필드 누락 경고, `notes`의 생성 순서·생성 조건·금지 정책·공개 전환 정책 필드화 경고, 정규화된 아키텍처 그래프의 첫 구조와 `graph` CLI 출력, 서비스·데이터 저장소·데이터 클래스·이벤트·외부 제공자 관계 간선 출력, 진단에 관련 그래프 관계를 붙이는 `explain` CLI 출력, service repo 참조 검사, 서비스 의존성 참조 검사, 데이터 저장소 참조 검사, 데이터 클래스 참조 검사, 데이터 클래스 선언 서비스의 카탈로그 참조·소유자·저장소 계약 검사, 이벤트 카탈로그 스키마 검사, 이벤트 `schema_ref` 파일 검사, 이벤트 payload JSON Schema 컴파일·`$id` 검사, 이벤트 참조 검사, 실제 `service.yaml` 생산 이벤트의 중앙 `schema_ref` 일치 검사, 실제 `service.yaml` 이벤트 재처리·실패 큐 운영 계약 검사, 외부 제공자 참조 검사, 후보 공개 도메인과 실제 공개 도메인 경계 검사, 제품·웹·실험 저장소의 민감 데이터 저장소 직접 접근 차단, 제품·프론트엔드 저장소의 원장 데이터 저장소 의존성 차단, AI 사용자 데이터 접근의 privacy broker·감사·권한 모델 검사, 민감 AI 데이터의 학습 제외와 무보관 또는 보관 예외 검사, AI 서비스의 비소유 데이터 저장소 직접 접근 차단, 엣지 런타임의 상태 저장소 직접 접근 차단, 금전 이동 서비스의 tier0·감사·멱등성·money 의존성 검사, 결제 데이터를 프론트엔드·lab 저장소가 직접 소유하는 구조 차단, 크레딧 과금의 공통 지갑·money ledger 소유 경계 검사, 외부 제공자 계약의 전송 데이터·비밀값 소유자·허용 환경 검사, 웹훅 제공자의 서명 검증·재처리 가능성 선언 검사, tier2 이상 서비스의 기본 운영 계약 검사, tier0 서비스의 불변 감사·비상 접근·키 소유자 검사, 위험 표면이 있는 tier3 실험의 비용·종료·관측성 기준 경고, 공개·파트너 API의 OpenAPI·버전·속도 제한·폐기 정책 검사, fixture 통과·실패 기대값 검사, `service.schema.json` 기반 service 계약 fixture 검사, 실제 저장소 루트의 `service.yaml` 스키마 검사와 `service.repo` 카탈로그 참조 검사, `service.id`의 중앙 서비스 카탈로그 등록 검사, 실제 `service.yaml`의 데이터 클래스·데이터 저장소·외부 제공자·이벤트 참조 검사, 실제 `service.yaml`의 데이터 접근·money·provider·AI·tier·public API 정책 검사는 구현됐다. 현재 `zdp-architecture`의 실제 카탈로그와 fixture는 `ZDP-REPO-001`, `ZDP-REPO-002`, `ZDP-REPO-003`, `ZDP-REPO-BASELINE-001`, `ZDP-REPO-MARKDOWN-001`, `ZDP-REPO-MARKDOWN-002`, `ZDP-WEBPUB-001`, `ZDP-CORE-001`, `ZDP-APP-001`, `ZDP-RUNTIME-001`, `ZDP-EDGE-001`, `ZDP-OBS-001`, `ZDP-INFRA-001`, `ZDP-DATA-PLATFORM-001`, `ZDP-GROWTH-001`, `ZDP-PRIVACY-001`, `ZDP-MONEY-PLATFORM-001`, `ZDP-REPO-WARN-001`, `ZDP-REPO-WARN-002`, `ZDP-SPLIT-001`, `ZDP-NOTES-WARN-001`, `ZDP-NOTES-WARN-002`, `ZDP-EVENT-001`, `ZDP-EVENT-002`, `ZDP-EVENT-003`, `ZDP-SERVICE-EVENT-001`, `ZDP-SERVICE-EVENT-002`, `ZDP-DOMAIN-001`, `ZDP-REF-001`, `ZDP-REF-002`, `ZDP-REF-003`, `ZDP-REF-004`, `ZDP-REF-005`, `ZDP-REF-006`, `ZDP-REF-007`, `ZDP-REF-008`, `ZDP-REF-009`, `ZDP-DATA-001`, `ZDP-DATA-002`, `ZDP-DATA-003`, `ZDP-DATA-005`, `ZDP-AI-001`, `ZDP-AI-002`, `ZDP-AI-003`, `ZDP-DATA-004`, `ZDP-MONEY-001`, `ZDP-MONEY-002`, `ZDP-MONEY-003`, `ZDP-PROVIDER-001`, `ZDP-PROVIDER-002`, `ZDP-TIER-001`, `ZDP-TIER-002`, `ZDP-TIER-WARN-001`, `ZDP-API-001`, `ZDP-SERVICE-SCHEMA-001`, `ZDP-SERVICE-SCHEMA-002`, `ZDP-SERVICE-SCHEMA-003`, `ZDP-SERVICE-SCHEMA-004` 기준을 통과한다.

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
bun src/cli.ts pack --architecture <zdp-architecture-path> --repo <repo> --task <task> --json
bun src/cli.ts pack --architecture <zdp-architecture-path> --repo <repo> --task <task> --out generated/llm/task-pack.md --json
bun src/cli.ts pack --architecture <zdp-architecture-path> --repo <repo> --task <task> --out generated/llm/task-pack.md --check --json
bun src/cli.ts check-split --architecture <zdp-architecture-path> --json
bun src/cli.ts diff --architecture <zdp-architecture-path> --base HEAD --json
bun src/cli.ts doctor --architecture <zdp-architecture-path> --json
bun src/cli.ts normalize --architecture <zdp-architecture-path> --json
bun src/cli.ts normalize --architecture <zdp-architecture-path> --out generated/registry.json --json
bun src/cli.ts normalize --architecture <zdp-architecture-path> --out generated/registry.json --check --json
bun src/cli.ts list repos --architecture <zdp-architecture-path> --stage deploy_unit --json
bun src/cli.ts list services --architecture <zdp-architecture-path> --repo zdp-core-platform --json
```

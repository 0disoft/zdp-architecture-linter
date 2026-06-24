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
- `.editorconfig`와 `.gitattributes`가 LF 줄바꿈, 마지막 줄, 공백 들여쓰기, Git 줄바꿈 정규화의 최소 정책을 담는지 검사한다.
- 실험 저장소 루트에 실험 가설과 종료 기준을 담는 `EXPERIMENT.md`가 있는지 검사한다.
- 패키지, CLI, SDK, 템플릿 성격의 저장소 루트에 `CONTRIBUTING.md`와 `CHANGELOG.md`가 있는지 검사한다.
- 운영 저장소, 민감 저장소, 경계가 두꺼운 저장소, 제품 저장소가 각각 `RUNBOOK.md`, `SECURITY.md`, `BOUNDARY.md`, `product-spec.md`를 갖는지 검사한다.
- 공개 정적 웹 저장소 루트에 `webpub.toml`이 있고, 후보 도메인과 robots 차단 정책이 `service.yaml`과 어긋나지 않는지 검사한다.
- `zdp-web-public` 저장소가 앱 패키지나 zero-fallback/glossary gate를 선언한 뒤에는 `check:localization` zero-fallback production compile gate, glossary stale-manifest gate, click-open Term Sheet placement, hover-card ad exclusion, private sibling checkout과 check/build CI가 공개 웹 dogfooding 계약으로 유지되는지 검사한다.
- glossary/Term Sheet 표면을 선언한 저장소가 hover tooltip/card 광고 슬롯, Term Sheet 광고 슬롯/provider, `term_id` 없는 용어 identity, generated manifest의 YAML source 누락을 갖는지 검사한다.
- `zdp-api-contracts` 저장소 루트의 route/error/webhook/SDK generation input 계약, core-api auth/session route catalog, checker skeleton, API export dry-run plan gate가 API 구현 전 유지되는지 검사한다.
- `zdp-libs-ts` 저장소 루트의 API contract source/package/schema/env/event/error/i18n 계약, checker skeleton, 최소 public export skeleton이 공통 TypeScript 패키지 구현 전 gate로 유지되는지 검사한다.
- `zdp-platform-localization` 저장소 루트의 `check:adoption` non-browser gate, fixture catalog diagnostics 0건, generated large-catalog diagnostics 0건, production zero-fallback manifest, large-catalog route-scope ratio 기준, HMR 별도 검증 경계, 내부 전용 posture, 필수 `@zdp/localization-*` package boundary가 내부 채택 전 유지되는지 검사한다.
- `zdp-client-sdks` 저장소 루트의 SDK generation source handoff, API SDK generation input drift check, API export dry-run plan handoff, libs export source handoff, sdk surface, auth helper, upload client 계약과 checker skeleton, dry-run generation plan skeleton이 SDK 구현 전 gate로 유지되는지 검사한다.
- `zdp-core-platform` 저장소 루트의 GitHub Actions Rust CI, core boundary, command envelope, audit event, consent record, auth/session runtime handoff, identity session store, auth credential vault handoff, auth audit event persistence, auth audit storage adapter, auth idempotency storage 계약 파일이 구현 전 gate로 유지되는지 검사한다.
- `zdp-web-apps` 저장소 루트의 app shell 계약, SvelteKit route skeleton, `platform-localization` provider adoption prerequisite가 platform truth를 소유하지 않는지 검사한다.
- `zdp-platform-runtime` 저장소 루트의 health/readiness, `core-api`/`app-console`/`edge-webhook-ingress`/`money-api`/`connectors-platform` smoke target, `platform-security-contracts`/`platform-infra-contracts`/`platform-observability-contracts` one-shot contract check target, deployment template, rollback 계약과 smoke runner skeleton이 배포 전 gate로 유지되는지 검사한다.
- `zdp-data-platform` 저장소 루트의 analytics ingest, ClickHouse storage, deletion/anonymization 계약, architecture-aware checker skeleton, validator-only runtime skeleton이 GA4 대체 분석 gate로 유지되는지 검사한다.
- `zdp-edge-workers` 저장소 루트의 request boundary, webhook ingress, queue envelope, analytics ingress 계약과 data-platform runtime-compatible precheck source/test가 Worker 구현 전 gate로 유지되는지 검사한다.
- `zdp-platform-observability` 저장소 루트의 telemetry convention, dashboard inventory, alert rule 계약과 checker skeleton이 provider 연결 전 gate로 유지되는지 검사한다.
- `zdp-platform-infra` 저장소 루트의 resource inventory, environment schema, backup/restore 계약과 repo-local checker, provider-neutral dry-run plan skeleton이 provider 연결 전 gate로 유지되는지 검사한다.
- `zdp-platform-security` 저장소 루트의 security baseline, threat model template, secret handling, dependency review 계약과 checker skeleton이 scanner 구현 전 gate로 유지되는지 검사한다.
- `zdp-data-platform` 저장소 루트의 analytics ingest, ClickHouse storage, deletion/anonymization 계약과 architecture-aware checker skeleton이 GA4 대체 구현 전 gate로 유지되는지 검사한다.
- `zdp-growth-lab` 저장소 루트의 funnel metric, growth experiment, experiment safety 계약과 checker skeleton이 CAC/LTV/CLV 정본이나 직접 DB 조회로 번지지 않는지 검사한다.
- `zdp-privacy-access-broker` 저장소 루트의 privacy access policy, capability grant, data minimization 계약, checker skeleton, 최소 Rust/Axum runtime skeleton이 raw token, raw source payload, subject-level analytics stream, 제품 권한·이용권·원장 판단으로 번지지 않는지 검사한다.
- `zdp-privacy-credential-vault` 저장소 루트의 credential boundary, capability issuance, access audit, storage boundary 계약, checker skeleton, 최소 Rust/Axum runtime skeleton이 connector/product/AI/analytics 경계로 raw credential을 새게 만들거나 audit/restore/log에 raw secret을 남기지 않는지 검사한다.
- `zdp-connectors-platform` 저장소 루트의 provider registry, sync-state, webhook replay, provider boundary 계약, checker skeleton, 최소 Rust/Axum runtime skeleton이 credential vault capability·privacy broker scope·idempotency 없이 provider 연동을 열거나 raw token/source payload, final authorization, entitlement, ledger, privacy policy 판단으로 번지지 않는지 검사한다.
- `zdp-money-platform` 저장소 루트의 billing/payments/ledger/risk boundary, money command envelope, append-only ledger entry, ledger storage, payment webhook, entitlement-credit 계약, checker skeleton, 최소 Rust/Axum API skeleton, 순수 Rust ledger core, command-to-ledger admission layer, payment webhook-to-command handoff layer, payment webhook processing state/outbox skeleton, payment webhook processing storage port skeleton이 제품 저장소의 잔액 변경, 중복 웹훅 반영, raw 결제 데이터 저장으로 번지지 않는지 검사한다.
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
catalogs/cost-budgets.yaml
catalogs/slo-tiers.yaml
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
fixtures/service-schema/pass/**
fixtures/service-schema/fail/**
```

`fixtures/pass`와 `fixtures/fail`은 정책 gate용 축약 fixture다. 전체 `service.yaml` 스키마 fixture는 `fixtures/service-schema/pass`와 `fixtures/service-schema/fail`에 둔다. 실제 저장소 루트의 `service.yaml`은 `schemas/service.schema.json`을 통과해야 한다.

`catalogs/cost-budgets.yaml`과 `catalogs/slo-tiers.yaml`은 기계가 읽을 수 있는 YAML 원천이며, linter는 예산·자동 조치·SLO tier mapping의 기본 구조와 내부 참조 무결성을 검사한다.

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

저장소 부트스트랩, repository catalog 필수 필드 검사, repository 이름 접두어와 area 매핑 검사, 실제 저장소 루트의 기본 파일 검사, 실험 저장소 루트의 `EXPERIMENT.md` 검사, 패키지·CLI·SDK·템플릿 저장소 루트의 `CONTRIBUTING.md`와 `CHANGELOG.md` 검사, 공개 정적 웹 저장소 루트의 `webpub.toml` 후보 발행 계약 검사, `zdp-api-contracts` 저장소 루트의 route/error/webhook/SDK generation input 계약, core-api auth/session route catalog, checker skeleton, API export dry-run plan gate 검사, `zdp-libs-ts` 저장소 루트의 API contract source/package/schema/env/event/error/i18n 계약, checker skeleton, API source input drift check, 최소 public export skeleton gate 검사, `zdp-client-sdks` 저장소 루트의 SDK generation source/API export plan handoff/sdk surface/auth helper/upload client 계약과 checker skeleton gate 검사, `zdp-core-platform` 저장소 루트의 core 계약 gate 검사, `zdp-web-apps` 저장소 루트의 app shell 계약 gate 검사, `zdp-platform-runtime` 저장소 루트의 runtime smoke 계약 gate 검사, `zdp-edge-workers` 저장소 루트의 edge와 analytics ingress 계약 및 data-platform runtime-compatible source/test gate 검사, `zdp-platform-observability` 저장소 루트의 observability 계약과 checker skeleton gate 검사, `zdp-platform-infra` 저장소 루트의 infra 계약 gate 검사, `zdp-platform-security` 저장소 루트의 security baseline, threat model template, secret handling, dependency review 계약과 checker skeleton gate 검사, `zdp-data-platform` 저장소 루트의 analytics ingest, ClickHouse storage, deletion/anonymization 계약, architecture-aware checker skeleton, validator-only runtime skeleton gate 검사, `zdp-growth-lab` 저장소 루트의 funnel metric, growth experiment, experiment safety 계약과 checker skeleton gate 검사, `zdp-privacy-access-broker` 저장소 루트의 privacy access policy, capability grant, data minimization 계약, checker skeleton, 최소 Rust/Axum runtime skeleton gate 검사, `zdp-privacy-credential-vault` 저장소 루트의 credential boundary, capability issuance, access audit, storage boundary 계약과 checker skeleton gate 검사, `zdp-connectors-platform` 저장소 루트의 provider registry, sync-state, webhook replay, provider boundary 계약과 checker skeleton gate 검사, `zdp-money-platform` 저장소 루트의 money boundary, command envelope, ledger entry, ledger storage, payment webhook, entitlement-credit 계약, checker skeleton, 최소 API skeleton, 순수 ledger core, command-to-ledger admission layer, payment webhook-to-command handoff layer, payment webhook processing state/outbox skeleton, payment webhook processing storage port skeleton gate 검사, 조건부 배포 저장소의 `create_when` 누락 경고, 예약 배포 저장소의 로드맵 근거 누락 경고, 분리 대상 저장소 등록과 독립 저장소 후보 검토 경고, `lab_only + kind: lab` 저장소의 실험 서비스 계약 허용, `check-split` CLI 출력, 저장소 작업 맥락을 압축하는 `pack` CLI 출력, `generated/llm/task-pack.md` 쓰기와 최신성 검사, Git 기준점과 현재 작업 트리 또는 다른 Git 기준점 사이의 카탈로그 핵심 ID 변화와 진단 변화량을 보여주는 `diff` CLI 출력, 필수 원천 파일·카탈로그 로딩·검증 결과·Git 작업 트리·생성물 경계·선택 저장소의 `service.yaml` 상태를 읽기 전용으로 점검하는 `doctor` CLI 출력, 저장소·서비스·데이터 저장소·데이터 클래스·이벤트·외부 제공자 노드와 그래프 간선, 검증 요약을 안정적인 JSON 형태로 펴는 `normalize` CLI 출력, `generated/registry.json` 쓰기와 최신성 검사, 저장소와 서비스를 필터링해 조회하는 `list repos/services` CLI 출력, `notes` 최신성 정책의 기계 필드 누락 경고, `notes`의 생성 순서·생성 조건·금지 정책·공개 전환 정책 필드화 경고, 정규화된 아키텍처 그래프의 첫 구조와 `graph` CLI 출력, 서비스·데이터 저장소·데이터 클래스·이벤트·외부 제공자 관계 간선 출력, 진단에 관련 그래프 관계를 붙이는 `explain` CLI 출력, service repo 참조 검사, 서비스 의존성 참조 검사, 데이터 저장소 참조 검사, 데이터 클래스 참조 검사, 데이터 클래스 선언 서비스의 카탈로그 참조·소유자·저장소 계약 검사, 이벤트 카탈로그 스키마 검사, 이벤트 `schema_ref` 파일 검사, 이벤트 payload JSON Schema 컴파일·`$id` 검사, 이벤트 참조 검사, 실제 `service.yaml` 생산 이벤트의 중앙 `schema_ref` 일치 검사, 실제 `service.yaml` 이벤트 재처리·실패 큐 운영 계약 검사, 외부 제공자 참조 검사, 후보 공개 도메인과 실제 공개 도메인 경계 검사, 제품·웹·실험 저장소의 민감 데이터 저장소 직접 접근 차단, 제품·프론트엔드 저장소의 원장 데이터 저장소 의존성 차단, AI 사용자 데이터 접근의 privacy broker·감사·권한 모델 검사, 민감 AI 데이터의 학습 제외와 무보관 또는 보관 예외 검사, AI 서비스의 비소유 데이터 저장소 직접 접근 차단, 엣지 런타임의 상태 저장소 직접 접근 차단, 금전 이동 서비스의 tier0·감사·멱등성·money 의존성 검사, 결제 데이터를 프론트엔드·lab 저장소가 직접 소유하는 구조 차단, 크레딧 과금의 공통 지갑·money ledger 소유 경계 검사, 외부 제공자 계약의 전송 데이터·비밀값 소유자·허용 환경 검사, 웹훅 제공자의 서명 검증·재처리 가능성 선언 검사, tier2 이상 서비스의 기본 운영 계약 검사, tier0 서비스의 불변 감사·비상 접근·키 소유자 검사, 위험 표면이 있는 tier3 실험의 비용·종료·관측성 기준 경고, 공개·파트너 API의 OpenAPI·버전·속도 제한·폐기 정책 검사, fixture 통과·실패 기대값 검사, `service.schema.json` 기반 service 계약 fixture 검사, 실제 저장소 루트의 `service.yaml` 스키마 검사와 `service.repo` 카탈로그 참조 검사, `service.id`의 중앙 서비스 카탈로그 등록 검사, 실제 `service.yaml`의 데이터 클래스·데이터 저장소·외부 제공자·이벤트 참조 검사, 실제 `service.yaml`의 데이터 접근·money·provider·AI·tier·public API 정책 검사는 구현됐다. 현재 `zdp-architecture`의 실제 카탈로그와 fixture는 `ZDP-REPO-001`, `ZDP-REPO-002`, `ZDP-REPO-003`, `ZDP-REPO-BASELINE-001`, `ZDP-REPO-MARKDOWN-001`, `ZDP-REPO-MARKDOWN-002`, `ZDP-WEBPUB-001`, `ZDP-API-CONTRACTS-001`, `ZDP-AUTH-ROUTE-001`, `ZDP-LIBS-001`, `ZDP-CLIENT-SDKS-001`, `ZDP-CORE-001`, `ZDP-APP-001`, `ZDP-RUNTIME-001`, `ZDP-EDGE-001`, `ZDP-OBS-001`, `ZDP-INFRA-001`, `ZDP-SECURITY-001`, `ZDP-DATA-PLATFORM-001`, `ZDP-GROWTH-001`, `ZDP-PRIVACY-001`, `ZDP-CREDENTIAL-001`, `ZDP-CONNECTORS-001`, `ZDP-MONEY-PLATFORM-001`, `ZDP-REPO-WARN-001`, `ZDP-REPO-WARN-002`, `ZDP-SPLIT-001`, `ZDP-NOTES-WARN-001`, `ZDP-NOTES-WARN-002`, `ZDP-EVENT-001`, `ZDP-EVENT-002`, `ZDP-EVENT-003`, `ZDP-SERVICE-EVENT-001`, `ZDP-SERVICE-EVENT-002`, `ZDP-DOMAIN-001`, `ZDP-REF-001`, `ZDP-REF-002`, `ZDP-REF-003`, `ZDP-REF-004`, `ZDP-REF-005`, `ZDP-REF-006`, `ZDP-REF-007`, `ZDP-REF-008`, `ZDP-REF-009`, `ZDP-DATA-001`, `ZDP-DATA-002`, `ZDP-DATA-003`, `ZDP-DATA-005`, `ZDP-AI-001`, `ZDP-AI-002`, `ZDP-AI-003`, `ZDP-DATA-004`, `ZDP-MONEY-001`, `ZDP-MONEY-002`, `ZDP-MONEY-003`, `ZDP-PROVIDER-001`, `ZDP-PROVIDER-002`, `ZDP-TIER-001`, `ZDP-TIER-002`, `ZDP-TIER-WARN-001`, `ZDP-API-001`, `ZDP-SERVICE-SCHEMA-001`, `ZDP-SERVICE-SCHEMA-002`, `ZDP-SERVICE-SCHEMA-003`, `ZDP-SERVICE-SCHEMA-004` 기준을 통과한다.

0.39.17부터 `ZDP-AUTH-ROUTE-001`이 `zdp-api-contracts`의 core-api auth/session route catalog와 auth/session schema bundle을 검사한다. registration, session issue/refresh/revoke, recovery, passkey, OAuth callback route, identity owner boundary, request_id/trace_id, session effect, credential policy, 민감 payload 금지값이 사라지면 실패한다.

0.39.63부터 `ZDP-API-CONTRACTS-001`과 `ZDP-AUTH-ROUTE-001`은 API 계약의 `raw_customer_payload`, `authorization_header`, `cookie_header`, `refresh_token_plaintext`, `stack_trace` 금지값, `route-catalog-contract-only` catalog status, SDK source contract의 auth/session schema bundle 포함 여부를 최신 `zdp-api-contracts` 기준으로 검사한다.

0.39.18부터 `ZDP-APP-001`은 `zdp-web-apps` auth route promotion 계약이 `zdp-api-contracts/contracts/apis/catalog.yaml`의 core-api auth/session operation 목록을 명시하되, live core runtime handoff와 product reviewer approval 전에는 route를 열지 않는 상태를 유지하는지 검사한다.

0.39.19부터 `ZDP-CORE-001`은 `zdp-core-platform` auth/session runtime handoff 계약이 `contracted_no_live_handler`, catalog source, 8개 auth/session operation, request/trace/idempotency/audit/session-store/credential-vault handoff, promotion blocker, plaintext refresh token 금지선을 유지하는지 검사한다.

0.39.35부터 `ZDP-CORE-001`은 `zdp-core-platform` auth runtime readiness summary 계약이 `readiness_summary_no_runtime_promotion`, `promotion_ready: false`, `production_route_ready: false`, required gate states, blocking summary, forbidden readiness claims를 유지하는지 검사한다. session store, credential vault handoff, passkey challenge store, OAuth callback state, audit persistence/storage adapter, idempotency, request/trace propagation, refresh token rotation, product reviewer approval gate는 durable implementation 또는 review proof가 없으면 계속 blocker로 남아야 한다. 이 summary는 blocker map이며 durable auth runtime, provider token exchange, DB migration, live handler, product route unblock proof가 아니다.

0.39.36부터 `ZDP-CORE-001`은 `zdp-core-platform` auth runtime admission context 계약이 `contract_only_no_live_handler`, `typed_admission_boundary_no_live_handler`, `contracts/auth-session-runtime.yaml` source, 8개 auth/session operation, request/trace/idempotency/resource/audit metadata, raw credential/provider payload 금지선을 유지하는지 검사한다. 이 boundary는 future auth/session command metadata gate일 뿐 live auth handler, durable request propagation, provider token exchange, DB migration, storage adapter, product route unblock proof가 아니다.

0.39.37부터 `ZDP-CORE-001`은 `zdp-core-platform` auth runtime command propagation 계약이 `contract_only_no_live_handler`, `typed_propagation_boundary_no_live_handler`, `contracts/auth-runtime-admission-context.yaml` source, request/trace/idempotency/resource/audit metadata, session/passkey/OAuth/audit/idempotency target, raw credential/provider payload 금지선을 유지하는지 검사한다. readiness summary는 이 계약을 evidence로 참조해도 live handler, durable propagation, DB migration, storage adapter, audit persistence, provider token exchange, product route unblock proof로 취급하면 안 된다.

0.39.38부터 `ZDP-CORE-001`은 `zdp-core-platform` auth durable storage admission 계약이 `contract_only_no_migration`, `typed_durable_storage_admission_no_migration`, admission/propagation source, storage/schema/migration/review/transaction/rollback ref, request/trace/idempotency/resource/audit metadata, identity session/passkey/OAuth/audit/idempotency/refresh-token storage target, raw secret/provider payload 금지선을 유지하는지 검사한다. readiness summary는 이 계약을 evidence로 참조해도 DB migration, durable adapter, transaction manager, live handler, provider token exchange, product route unblock proof로 취급하면 안 된다.

0.39.40부터 `ZDP-CORE-001`은 `zdp-core-platform` auth durable storage migration readiness 계약이 `contract_only_no_migration`, `typed_migration_readiness_no_migration`, durable storage admission/readiness source, storage/schema/migration/schema-owner/review/transaction/rollback/admission plan ref, auth storage target, seed/backfill과 destructive migration rejection, raw secret/provider payload 금지선을 유지하는지 검사한다. readiness summary는 이 계약을 evidence로 참조해도 DB migration applied, durable adapter ready, transaction manager, live handler, provider token exchange, product route unblock proof로 취급하면 안 된다.

0.39.41부터 `ZDP-CORE-001`은 `zdp-core-platform` auth durable storage transaction/outbox 계약이 `contract_only_no_transaction_manager`, `typed_transaction_outbox_boundary_no_adapter`, migration readiness source, transaction/outbox/commit/rollback/replay/review ref, request/trace/idempotency/resource/audit metadata, atomic state+outbox control, external-effect-after-commit control, raw secret/provider payload 금지선을 유지하는지 검사한다. readiness summary는 이 계약을 evidence로 참조해도 DB transaction manager, outbox dispatcher, durable adapter ready, live handler, provider token exchange, product route unblock proof로 취급하면 안 된다.

0.39.39부터 `ZDP-CHATGPT-APP-001`은 `zdp-ai-chatgpt-gateway` conditional repo plan, `chatgpt-mcp-gateway` service contract, OpenAI provider의 ChatGPT Apps SDK/MCP host 경계를 검사한다. 새 Git 저장소 선생성 금지, `/mcp` edge adapter 위치, 직접 datastore 접근 금지, privacy broker·credential vault·audit·idempotency 선행 조건, structuredContent/content/_meta/widget state secret 금지, 구현 전 OpenAI 공식 문서 재확인 문구가 사라지면 실패한다.

0.39.20부터 `ZDP-CORE-001`은 `zdp-core-platform` identity session store 계약이 `contract_only_no_migration`, identity owner boundary, session/refresh/revocation 필드, refresh token hash-only rotation, reuse detection, TTL, idempotency, audit reference, plaintext token/secret 금지선을 유지하는지 검사한다. 0.39.62부터는 foundation migration shape가 선언된 최신 계약에 맞춰 `migration_shape_declared_no_adapter`, `command_id`, `idempotency_key`, `audit_event_ref`를 검사한다.

0.39.31부터 `ZDP-CORE-001`은 identity session store 계약의 `typed_adapter_boundary_no_migration` adapter boundary도 검사한다. transactional session store 또는 session state table adapter kind, transaction/issue/refresh/revoke/reuse/review reference, session id와 refresh token hash uniqueness, atomic refresh rotation, reuse-family block, revocation state, TTL, audit event reference, plaintext refresh token 저장 금지 기준이 사라지면 실패한다. 이 상태는 durable session storage implementation이나 DB migration 완료를 의미하지 않는다.

0.39.21부터 `ZDP-CORE-001`은 `zdp-core-platform` auth credential vault handoff 계약이 `contract_only_no_capability_client`, identity owner boundary, `zdp-privacy-credential-vault` vault owner, capability ref/metadata-only handoff, short-lived scope, request/trace/idempotency/audit reference, raw secret 반환 금지, vault access audit 기준을 유지하는지 검사한다. 0.39.32부터는 typed capability client boundary도 검사한다. capability client boundary는 `typed_capability_client_boundary_no_vault_client` 상태, vault capability/credential metadata client kind, capability ref, credential metadata, request/trace/idempotency/audit/vault-access-audit ref, review 또는 client implementation ref, raw secret material reject, provider payload storage 금지 기준을 유지해야 한다. 이 상태는 live vault client, network call, secret decrypt/read path, vault access audit proof가 있다는 뜻이 아니다.

0.39.27부터 `ZDP-CORE-001`은 `zdp-core-platform` auth passkey challenge store 계약이 `contract_only_no_storage`, identity owner boundary, challenge hash-only storage, registration/authentication/recovery ceremony type, active/consumed/expired/revoked state, single-use consumption, TTL, request/trace/idempotency/audit reference, consume/expire metadata, raw WebAuthn payload 저장 금지 기준을 유지하는지 검사한다. 0.39.33부터는 typed adapter boundary도 검사한다. adapter boundary는 `typed_adapter_boundary_no_migration`, passkey challenge hash/state adapter kind, storage/transaction/issue/consume/expire/review reference, challenge id/hash uniqueness, challenge version, atomic single-use consume, active-state consume, TTL, audit event reference, raw WebAuthn payload 금지 기준을 유지해야 한다. 이 상태는 durable challenge storage implementation이나 DB migration 완료를 의미하지 않는다. `contracts/auth-session-runtime.yaml`도 `no_passkey_challenge_store_implementation` blocker를 유지해야 한다.

0.39.34부터 `ZDP-CORE-001`은 `zdp-core-platform` auth OAuth callback state verification 계약이 `contract_only_no_storage`, identity owner boundary, callback state hash-only storage, nonce hash-only storage, PKCE verifier reference, redirect URI reference, active/consumed/expired/revoked state, provider scope, single-use consumption, TTL, request/trace/idempotency/audit reference, consume/expire/revoke metadata, raw OAuth provider payload 저장 금지 기준을 유지하는지 검사한다. typed adapter boundary도 `typed_adapter_boundary_no_migration`, OAuth callback state hash/table adapter kind, storage/transaction/issue/consume/expire/revoke/review reference, state id/hash uniqueness, state version, atomic single-use consume, active-state consume, TTL, audit event reference, raw OAuth payload 금지 기준을 유지해야 한다. 이 상태는 durable callback state storage implementation, DB migration, provider token exchange, live OAuth callback handler 완료를 의미하지 않는다.

0.39.28부터 `ZDP-APP-001`은 `zdp-web-apps` auth route promotion 계약이 core auth/session promotion blocker 해소 조건을 명시하는지 검사한다. route catalog adoption과 live runtime handoff 문구만으로는 부족하며, core blocker가 남아 있으면 login/signup/recovery/passkey/provider-choice route는 계속 차단 상태여야 한다.

0.39.29부터 `ZDP-APP-001`은 `zdp-web-apps` source route tree도 검사해 `/auth`, `/sign-in`, `/oauth/callback` 같은 auth route alias가 promotion 전에 생기면 실패한다. repo-local `check-app-shell`과 중앙 architecture validation은 같은 auth route 차단 경계를 봐야 한다.

0.39.22부터 `ZDP-CORE-001`은 `zdp-core-platform` auth audit event persistence 계약이 audit owner boundary, identity source boundary, auth operation/session effect metadata, append-only audit store, command/idempotency/request/trace reference, redacted summary, privileged evidence ref, auth failure event, audit write failure 차단, raw credential/provider payload 금지 기준을 유지하는지 검사한다.

0.39.62부터 `ZDP-CORE-001`은 `zdp-core-platform` core event outbox 계약이 `migration_shape_declared_no_dispatcher`, dispatcher/replay/consumer 미구현 상태, CloudEvents source, money-relevant event 목록, append-only outbox/delivery attempt table, payload reference only, required outbox/delivery fields, dispatcher-ready claim 금지 기준을 유지하는지 검사한다. 이 상태는 dispatcher, replay worker, consumer inbox, production route unblock이 구현됐다는 뜻이 아니다.

0.39.24부터 `ZDP-CORE-001`은 auth audit event persistence 상태를 `append_receipt_gate_no_durable_store`로 올리고, `outcome`, `request_id`, `transaction_or_outbox_ref` 필드를 필수로 검사한다. 이 상태는 성공 응답 전 append receipt gate가 있다는 뜻이지 durable append-only adapter나 DB migration이 있다는 뜻은 아니다.

0.39.26부터 `ZDP-CORE-001`은 `zdp-core-platform` GitHub Actions CI workflow가 `actions/checkout@v6`, stable Rust toolchain, `rustfmt`, `cargo fmt --check`, `cargo check --locked --all-targets`, `cargo test --locked` 계약을 유지하는지 검사한다.

0.39.25부터 `ZDP-CORE-001`은 `zdp-core-platform` auth audit storage adapter 계약이 `contract_only_no_adapter`, audit owner boundary, `contracts/auth-audit-event-persistence.yaml` source contract, append-only table 또는 transactional outbox adapter kind, storage/transaction/receipt/replay/review reference, append-only/unique-event enforcement, transaction/outbox atomicity, audit write failure 차단, redaction/raw-payload gate, raw credential/provider payload 금지 기준을 유지하는지 검사한다. 이 상태는 durable adapter나 DB migration 구현 완료를 의미하지 않는다.

0.39.23부터 `ZDP-CORE-001`은 `zdp-core-platform` auth idempotency storage 계약이 `contract_only_no_storage`, identity owner boundary, scoped idempotency record, request fingerprint replay/conflict, in-progress duplicate suppression, TTL, atomic claim/unique constraint, audit reference, raw payload/secret 저장 금지 기준을 유지하는지 검사한다.

0.39.30부터 `ZDP-CORE-001`은 auth idempotency storage 계약의 `audit_event_ref` record field와 `typed_adapter_boundary_no_migration` adapter boundary도 검사한다. atomic unique claim table 또는 transactional idempotency record adapter kind, transaction/claim/replay/conflict/review reference, atomic claim/conflict, TTL, raw payload 금지, audit event reference 기준이 사라지면 실패한다. 이 상태는 durable storage implementation이나 DB migration 완료를 의미하지 않는다.

0.39.0부터 실제 저장소 루트 검사는 `.editorconfig`와 `.gitattributes`의 최소 줄바꿈 정책, `RUNBOOK.md`, `SECURITY.md`, `BOUNDARY.md`, `product-spec.md` 조건부 루트 Markdown도 함께 검사한다. 새 진단 ID는 `ZDP-REPO-MARKDOWN-003`, `ZDP-REPO-MARKDOWN-004`, `ZDP-REPO-MARKDOWN-005`, `ZDP-REPO-MARKDOWN-006`이다.

0.39.5부터 `ZDP-LOCALIZATION-001`이 `zdp-platform-localization`의 필수 내부 package set, `@zdp/localization-*` package name, `private: true`, `zdp-localization` CLI bin 계약도 검사한다. `check-internal-posture`가 package missing/name/bin drift 진단을 잃으면 실패한다.

0.39.8부터 `ZDP-LOCALIZATION-001`이 `zdp-platform-localization`의 `check:adoption` non-browser gate, fixture catalog diagnostics 0건, generated large-catalog diagnostics 0건, production zero-fallback manifest, large-catalog route-scope ratio 25% 기준, HMR 별도 검증 경계와 내부 전용 posture를 검사한다. Dora branding, 공개 npm/publish 문구, open source escape-hatch 문구, open source conversion 고려 문구, README/AGENTS/ADR의 내부 전용 선언이 사라지면 실패한다. `ZDP-APP-001`은 `zdp-web-apps` app shell service contract가 `platform-localization` 의존성과 provider `check:adoption` 선행 조건을 유지하는지도 검사한다.

0.39.9부터 `ZDP-WEBPUB-001`이 `zdp-web-public`에서 앱 패키지 또는 zero-fallback/glossary 운영 gate가 선언된 경우 `package.json` check wiring, `scripts/check-localization.ts` strict production compile, `scripts/check-glossary.ts` stale manifest check, `scripts/glossary-build.ts`의 reviewed public terms, click-open Term Sheet placement, hover-card ad exclusion, Term Sheet ad exclusion/detail-page experiment helper, `service.yaml`의 운영 계약 문구를 검사한다. 루트 계약만 가진 초기 공개 웹 scaffold는 `webpub.toml` 발행 계약만 검사한다.

0.39.10부터 `ZDP-XCUT-TERM-ADS-001`, `ZDP-XCUT-TERM-ADS-002`, `ZDP-XCUT-TERM-001`, `ZDP-XCUT-TERM-007`이 repository-level glossary/Term Sheet 계약을 검사한다. `service.yaml`, `glossary/terms`, `src/content/glossary-manifest.json` 중 하나가 용어 설명 표면을 선언하면 hover 광고 슬롯과 Term Sheet 광고 슬롯/provider는 error, `term_id` 누락과 generated manifest YAML source 누락은 warning으로 보고한다.

0.39.12부터 `ZDP-WEBPUB-001`은 `zdp-web-public` localization canary가 home hero title과 CTA 메시지로 제한되고 static Astro copy rollback boundary와 runtime feature flag 불필요 계약을 유지하는지 검사한다. `ZDP-APP-001`은 `zdp-web-apps`의 `contracts/app-shell.yaml`에서 `localization_canary` scope, 6개 app-shell message key, expansion review, rollback boundary, runtime feature flag 불필요 계약을 검사한다.

0.39.13부터 `ZDP-APP-001`은 `zdp-web-apps`의 GitHub Actions CI workflow가 private `zdp-platform-localization` checkout용 `ZDP_CI_READ_TOKEN`, `actions/checkout@v6`, provider workspace install, app install, `bun run check`, `bun run build` 계약을 유지하는지도 검사한다.

0.39.14부터 `ZDP-WEBPUB-001`은 `zdp-web-public`의 GitHub Actions CI workflow가 private sibling `zdp-design-system`과 `zdp-platform-localization` checkout용 `ZDP_CI_READ_TOKEN`, `actions/checkout@v6`, design-system package build, public site install, `bun run check`, `bun run build` 계약을 유지하는지도 검사한다.

0.39.15부터 `ZDP-WEBPUB-001`은 fresh CI의 local file dependency consumer install이 lockfile을 쓰려고 실패하지 않도록 `zdp-web-public` workflow의 public site install step이 `bun install --no-save`를 쓰는지도 검사한다.

0.39.16부터 `ZDP-WEBPUB-001`은 `zdp-web-public` glossary checks가 source import와 YAML source를 찾을 수 있도록 `zdp-platform-devex`와 `zdp-libs-ts` sibling checkout도 검사한다.

## 개발 명령

`ZDP-CREDENTIAL-001`은 0.37.5부터 `zdp-privacy-credential-vault`의 credential 계약과 checker skeleton뿐 아니라 최소 Rust/Axum runtime skeleton도 검사한다.

`ZDP-CONNECTORS-001`은 0.37.6부터 `zdp-connectors-platform`의 provider 계약과 checker skeleton뿐 아니라 최소 Rust/Axum runtime skeleton도 검사한다.

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

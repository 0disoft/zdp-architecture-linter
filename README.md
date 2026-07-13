# zdp-architecture-linter

제품 저장소가 제품 행동에 묶인 개인정보를 직접 소유하면 `ZDP-DATA-006`이 소유 datastore, 삭제 대상과 증거, 관리자 접근 감사, `human_review_required`의 `privacy` 항목을 검사한다.

ZDP 아키텍처 카탈로그와 서비스 계약을 검증하는 CLI 저장소다.

정책의 원천은 `zdp-architecture` 문서 저장소다. 이 저장소는 그 원천을 읽어 검증 가능한 규칙으로 실행한다.

## 문서 라우터

이 저장소는 ssealed식 문서 구조를 ZDP linter 경계에 맞춰 얇게 반영한다. 새 작업자는 아래 순서로 읽는다.

- `CHECKLIST.md`: 변경 유형별 리뷰 체크리스트 라우터
- `VALIDATION.md`: mustflow intent 기준 검증 이름과 선택 기준
- `.agents/context-map.md`: agent 작업 라우팅
- `docs/cli/command-contract.md`: CLI 명령·옵션·출력 계약
- `docs/cli/output-and-exit-codes.md`: JSON 출력과 exit code 계약
- `docs/architecture/00-system-boundary.md`: 정책 원천과 linter 책임 경계
- `docs/engineering/05-testing-standard.md`: 규칙·fixture·CLI 회귀 테스트 기준
- `docs/ops/ci.md`, `docs/ops/release.md`, `docs/ops/rollback.md`: 운영 검증, 릴리스, 롤백 기준

## 공개 저장소 경계

- 이 저장소를 GitHub public visibility로 전환하더라도 npm 공개 배포를 의미하지 않는다. `package.json`의 `private: true`는 유지한다.
- 현재 `LICENSE` 파일이 없으므로, 공개 visibility는 소스 열람 가능 상태일 뿐 오픈소스 라이선스 부여가 아니다. 재사용 권리를 열려면 별도 라이선스 결정을 먼저 해야 한다.
- 이 저장소에는 운영 secret, 고객 데이터, 실제 provider payload, private incident evidence를 두지 않는다. 테스트 fixture는 금지 필드 이름과 명시적인 가짜 값만 사용한다.

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
- `zdp-web-public` 저장소가 앱 패키지나 zero-fallback/glossary gate를 선언한 뒤에는 `check:localization` zero-fallback production compile gate, glossary stale-manifest gate, click-open Term Sheet placement, hover-card ad exclusion, sibling checkout과 check/build CI가 공개 웹 dogfooding 계약으로 유지되는지 검사한다.
- glossary/Term Sheet 표면을 선언한 저장소가 hover tooltip/card 광고 슬롯, Term Sheet 광고 슬롯/provider, `term_id` 없는 용어 identity, generated manifest의 YAML source 누락을 갖는지 검사한다.
- `zdp-api-contracts` 저장소 루트의 route/error/webhook/SDK generation input 계약, core-api auth/session route catalog, checker skeleton, API export dry-run plan gate가 API 구현 전 유지되는지 검사한다.
- `catalogs/repositories.yaml`의 `agent_review`가 자동 리뷰 편입 여부, playbook/group 연결, 실행 범위, 산출 정책, 제외·보류·삭제 사유를 기계 필드로 유지하는지 검사한다.
- `zdp-libs-ts` 저장소 루트의 API contract source/package/schema/env/event/error/i18n 계약, checker skeleton, 최소 public export skeleton이 공통 TypeScript 패키지 구현 전 gate로 유지되는지 검사한다.
- `zdp-platform-localization` 저장소 루트의 `check:adoption` non-browser gate, fixture catalog diagnostics 0건, generated large-catalog diagnostics 0건, production zero-fallback manifest, large-catalog route-scope ratio 기준, HMR 별도 검증 경계, 내부 전용 posture, 필수 `@zdp/localization-*` package boundary가 내부 채택 전 유지되는지 검사한다.
- `zdp-client-sdks` 저장소 루트의 SDK generation source handoff, API SDK generation input drift check, API export dry-run plan handoff, libs export source handoff, sdk surface, auth helper, upload client 계약과 checker skeleton, dry-run generation plan skeleton이 SDK 구현 전 gate로 유지되는지 검사한다.
- `zdp-core-platform` 저장소 루트의 GitHub Actions Rust CI, core boundary, command envelope, audit event, consent record, auth/session runtime handoff, identity session store, auth credential vault handoff, auth audit event persistence, auth audit storage adapter, auth idempotency storage, auth product review approval 계약 파일이 구현 전 gate로 유지되는지 검사한다.
- `zdp-web-apps` 저장소 루트의 app shell 계약, SvelteKit route skeleton, `platform-localization` provider adoption prerequisite가 platform truth를 소유하지 않는지 검사한다.
- `zdp-platform-runtime` 저장소 루트의 health/readiness, `core-api`/`app-console`/`edge-webhook-ingress`/`money-api`/`connectors-platform` smoke target, `platform-security-contracts`/`platform-infra-contracts`/`platform-observability-contracts`/`data-platform-contracts` one-shot contract check target, deployment template, rollback 계약과 smoke runner skeleton이 배포 전 gate로 유지되는지 검사한다.
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
- `zdp-token-protocol` 저장소 루트의 token authority matrix 계약이 Move/Sui capability별 owner/approver/signer threshold/timelock/rotation/revocation/monitoring/emergency replacement, authority 분리, 무제한 `AdminCap` 금지, single hot wallet 금지, self-custody 기본값과 managed custody gate를 잃지 않는지 검사한다.
- `zdp-token-indexer` 저장소 루트의 chain fact 계약이 checkpoint/effects/object-change/Move event/BCS payload source, canonical fact 필드, replay/quarantine, money consumption gate를 잃거나 signing/custody/ledger posting/customer-right 정본 역할로 번지지 않는지 검사한다.
- `zdp-token-protocol`과 `zdp-token-indexer` 저장소 루트의 Sui API 선택 계약이 JSON-RPC를 신규 baseline으로 삼거나 최신 공식 문서·migration guide 검토, gRPC/GraphQL/Core API/archival provider 선택 근거, 단일 endpoint config owner를 잃지 않는지 검사한다.
- money/core/product 서비스가 raw chain event 또는 token indexer datastore를 원장 entry, entitlement, 고객 권리 명령으로 직접 소비하지 않고 reconciliation/idempotency/package allowlist gate를 거치는지 검사한다.
- `zdp-token-protocol` 저장소 루트의 package upgrade 정책이 original/latest package id, dependency/build digest manifest, old package version guard, migration plan, event separation, publish/activation 분리, pause/unpause approval split을 잃지 않는지 검사한다.
- `zdp-token-protocol` 저장소 루트의 Token Identity Contract가 entitlement, credit, settlement, governance 권리와 각 정본 경계를 분리하는지 검사한다.
- `zdp-crypto-wallet`과 `zdp-token-operator` 저장소 루트의 custody control plane 계약이 self-custody, managed/custodial, sponsor wallet, treasury wallet, capability wallet 통제면과 signer owner/recovery/withdrawal approval/signer rotation/custody reconciliation/audit/capability scope를 분리하고, money/core/indexer/CI signer와 raw private key storage를 금지하는지 검사한다.
- repository root의 public discovery artifact(`llms.txt`, `sitemap.xml`, `robots.txt`, `.well-known`, discovery JSON)가 비밀값, 내부 URL, 비공개 경로를 노출하지 않는지 검사한다.
- 공개 API 오류 계약이 raw string이나 message-only 응답이 아니라 `error.code`, `error.message`, `error.request_id` envelope를 유지하는지 검사한다.
- deploy unit 저장소가 `automation.ci` 계약, dependency update bot 소유자, ruleset required status check 이름을 명확히 선언하는지 검사한다.
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
zdp-arch list repos --architecture <path> [--stage <repo_stage>] [--area <area>] [--agent-review-status <status>] --json
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

1. 카탈로그와 스키마 로더를 만든다. `[완료]`
2. repository catalog 필수 필드 검사를 구현한다. `[완료]`
3. service repo 참조 검사와 배포 불가 repo_stage 차단을 구현한다. `[완료]`
4. fixture 기반 통과/실패 테스트를 넓힌다. `[상시 확장]`
5. 정규화된 저장소, 서비스, 데이터 저장소 그래프와 선언된 관계 간선을 만들고 CLI에서 확인할 수 있게 한다. `[완료]`
6. `service.yaml` 스키마 검사를 구현한다. `[완료]`
7. 참조 무결성 검사를 데이터 저장소, 데이터 클래스, 이벤트, 외부 제공자로 확장한다. `[완료]`
8. 돈, 권한, 개인정보, AI, credential, provider, tier 규칙을 차례로 붙인다. `[대부분 완료, 신규 계약 동기화 중]`

## 현재 상태

0.39.126부터 `ZDP-PROVIDER-003`은 `psp` 또는 `psp-router` 외부 제공자 후보의 `webhook_intake` 안전 의무를 검사하고, `ZDP-PROVIDER-004` schema preflight는 `catalogs/external-providers.yaml`의 provider shape와 PSP 조건부 필수 필드를 fail-closed 검증한다. 이 카탈로그 계약은 provider 기능 보증이 아니라 실제 통합 시 ZDP가 서명 검증, 재처리, provider event id 중복 제거, 최신 공식 계약 증거를 구현해야 한다는 gate다.

저장소 부트스트랩, repository catalog 필수 필드 검사, repository 이름 접두어와 area 매핑 검사, 실제 저장소 루트의 기본 파일 검사, 실험 저장소 루트의 `EXPERIMENT.md` 검사, 패키지·CLI·SDK·템플릿 저장소 루트의 `CONTRIBUTING.md`와 `CHANGELOG.md` 검사, 공개 정적 웹 저장소 루트의 `webpub.toml` 후보 발행 계약 검사, `zdp-api-contracts` 저장소 루트의 route/error/webhook/SDK generation input 계약, core-api auth/session route catalog, checker skeleton, API export dry-run plan gate 검사, `zdp-libs-ts` 저장소 루트의 API contract source/package/schema/env/event/error/i18n 계약, checker skeleton, API source input drift check, 최소 public export skeleton gate 검사, `zdp-client-sdks` 저장소 루트의 SDK generation source/API export plan handoff/sdk surface/auth helper/upload client 계약과 checker skeleton gate 검사, `zdp-core-platform` 저장소 루트의 core 계약 gate 검사, `zdp-web-apps` 저장소 루트의 app shell 계약 gate 검사, `zdp-platform-runtime` 저장소 루트의 runtime smoke 계약 gate 검사, `zdp-edge-workers` 저장소 루트의 edge와 analytics ingress 계약 및 data-platform runtime-compatible source/test gate 검사, `zdp-platform-observability` 저장소 루트의 observability 계약과 checker skeleton gate 검사, `zdp-platform-infra` 저장소 루트의 infra 계약 gate 검사, `zdp-platform-security` 저장소 루트의 security baseline, threat model template, secret handling, dependency review 계약과 checker skeleton gate 검사, `zdp-data-platform` 저장소 루트의 analytics ingest, ClickHouse storage, deletion/anonymization 계약, architecture-aware checker skeleton, validator-only runtime skeleton gate 검사, `zdp-growth-lab` 저장소 루트의 funnel metric, growth experiment, experiment safety 계약과 checker skeleton gate 검사, `zdp-privacy-access-broker` 저장소 루트의 privacy access policy, capability grant, data minimization 계약, checker skeleton, 최소 Rust/Axum runtime skeleton gate 검사, `zdp-privacy-credential-vault` 저장소 루트의 credential boundary, capability issuance, access audit, storage boundary 계약과 checker skeleton gate 검사, `zdp-connectors-platform` 저장소 루트의 provider registry, sync-state, webhook replay, provider boundary 계약과 checker skeleton gate 검사, `zdp-money-platform` 저장소 루트의 money boundary, command envelope, ledger entry, ledger storage, payment webhook, money DB schema, entitlement-credit 계약, checker skeleton, 최소 API skeleton, 순수 ledger core, command-to-ledger admission layer, payment webhook-to-command handoff layer, payment webhook processing state/outbox skeleton, payment webhook processing storage port skeleton gate 검사, 조건부 배포 저장소의 `create_when` 누락 경고, 예약 배포 저장소의 로드맵 근거 누락 경고, 분리 대상 저장소 등록과 독립 저장소 후보 검토 경고, `lab_only + kind: lab` 저장소의 실험 서비스 계약 허용, `check-split` CLI 출력, 저장소 작업 맥락을 압축하는 `pack` CLI 출력, `generated/llm/task-pack.md` 쓰기와 최신성 검사, Git 기준점과 현재 작업 트리 또는 다른 Git 기준점 사이의 카탈로그 핵심 ID 변화와 진단 변화량을 보여주는 `diff` CLI 출력, 필수 원천 파일·카탈로그 로딩·검증 결과·Git 작업 트리·생성물 경계·선택 저장소의 `service.yaml` 상태를 읽기 전용으로 점검하는 `doctor` CLI 출력, 저장소·서비스·데이터 저장소·데이터 클래스·이벤트·외부 제공자 노드와 그래프 간선, 검증 요약을 안정적인 JSON 형태로 펴는 `normalize` CLI 출력, `generated/registry.json` 쓰기와 최신성 검사, 저장소와 서비스를 필터링해 조회하는 `list repos/services` CLI 출력, `notes` 최신성 정책의 기계 필드 누락 경고, `notes`의 생성 순서·생성 조건·금지 정책·공개 전환 정책 필드화 경고, 정규화된 아키텍처 그래프의 첫 구조와 `graph` CLI 출력, 서비스·데이터 저장소·데이터 클래스·이벤트·외부 제공자 관계 간선 출력, 진단에 관련 그래프 관계를 붙이는 `explain` CLI 출력, service repo 참조 검사, 서비스 의존성 참조 검사, 데이터 저장소 참조 검사, 데이터 클래스 참조 검사, 데이터 클래스 선언 서비스의 카탈로그 참조·소유자·저장소 계약 검사, 이벤트 카탈로그 스키마 검사, 이벤트 `schema_ref` 파일 검사, 이벤트 payload JSON Schema 컴파일·`$id` 검사, 이벤트 참조 검사, 실제 `service.yaml` 생산 이벤트의 중앙 `schema_ref` 일치 검사, 실제 `service.yaml` 이벤트 재처리·실패 큐 운영 계약 검사, 외부 제공자 참조 검사, 후보 공개 도메인과 실제 공개 도메인 경계 검사, 제품·웹·실험 저장소의 민감 데이터 저장소 직접 접근 차단, 제품·프론트엔드 저장소의 원장 데이터 저장소 의존성 차단, AI 사용자 데이터 접근의 privacy broker·감사·권한 모델 검사, 민감 AI 데이터의 학습 제외와 무보관 또는 보관 예외 검사, AI 서비스의 비소유 데이터 저장소 직접 접근 차단, 엣지 런타임의 상태 저장소 직접 접근 차단, 금전 이동 서비스의 tier0·감사·멱등성·money 의존성 검사, 결제 데이터를 프론트엔드·lab 저장소가 직접 소유하는 구조 차단, 크레딧 과금의 공통 지갑·money ledger 소유 경계 검사, payment webhook processing/outbox DB 계약 검사, 외부 제공자 계약의 전송 데이터·비밀값 소유자·허용 환경 검사, 웹훅 제공자의 서명 검증·재처리 가능성 선언 검사, tier2 이상 서비스의 기본 운영 계약 검사, tier0 서비스의 불변 감사·비상 접근·키 소유자 검사, 위험 표면이 있는 tier3 실험의 비용·종료·관측성 기준 경고, 공개·파트너 API의 OpenAPI·버전·속도 제한·폐기 정책 검사, fixture 통과·실패 기대값 검사, `service.schema.json` 기반 service 계약 fixture 검사, 실제 저장소 루트의 `service.yaml` 스키마 검사와 `service.repo` 카탈로그 참조 검사, `service.id`의 중앙 서비스 카탈로그 등록 검사, 실제 `service.yaml`의 데이터 클래스·데이터 저장소·외부 제공자·이벤트 참조 검사, 실제 `service.yaml`의 데이터 접근·money·provider·AI·tier·public API 정책 검사는 구현됐다. 현재 `zdp-architecture`의 실제 카탈로그와 fixture는 `ZDP-REPO-001`, `ZDP-REPO-002`, `ZDP-REPO-003`, `ZDP-REPO-BASELINE-001`, `ZDP-REPO-MARKDOWN-001`, `ZDP-REPO-MARKDOWN-002`, `ZDP-WEBPUB-001`, `ZDP-API-CONTRACTS-001`, `ZDP-AUTH-ROUTE-001`, `ZDP-LIBS-001`, `ZDP-CLIENT-SDKS-001`, `ZDP-CORE-001`, `ZDP-APP-001`, `ZDP-RUNTIME-001`, `ZDP-EDGE-001`, `ZDP-OBS-001`, `ZDP-INFRA-001`, `ZDP-SECURITY-001`, `ZDP-DATA-PLATFORM-001`, `ZDP-GROWTH-001`, `ZDP-PRIVACY-001`, `ZDP-CREDENTIAL-001`, `ZDP-CONNECTORS-001`, `ZDP-MONEY-PLATFORM-001`, `ZDP-MONEY-004`, `ZDP-REPO-WARN-001`, `ZDP-REPO-WARN-002`, `ZDP-SPLIT-001`, `ZDP-NOTES-WARN-001`, `ZDP-NOTES-WARN-002`, `ZDP-EVENT-001`, `ZDP-EVENT-002`, `ZDP-EVENT-003`, `ZDP-SERVICE-EVENT-001`, `ZDP-SERVICE-EVENT-002`, `ZDP-DOMAIN-001`, `ZDP-REF-001`, `ZDP-REF-002`, `ZDP-REF-003`, `ZDP-REF-004`, `ZDP-REF-005`, `ZDP-REF-006`, `ZDP-REF-007`, `ZDP-REF-008`, `ZDP-REF-009`, `ZDP-DATA-001`, `ZDP-DATA-002`, `ZDP-DATA-003`, `ZDP-DATA-005`, `ZDP-AI-001`, `ZDP-AI-002`, `ZDP-AI-003`, `ZDP-DATA-004`, `ZDP-MONEY-001`, `ZDP-MONEY-002`, `ZDP-MONEY-003`, `ZDP-PROVIDER-001`, `ZDP-PROVIDER-002`, `ZDP-TIER-001`, `ZDP-TIER-002`, `ZDP-TIER-WARN-001`, `ZDP-API-001`, `ZDP-SERVICE-SCHEMA-001`, `ZDP-SERVICE-SCHEMA-002`, `ZDP-SERVICE-SCHEMA-003`, `ZDP-SERVICE-SCHEMA-004` 기준을 통과한다.

0.39.68부터 `ZDP-MONEY-004`는 `zdp-money-platform`의 `contracts/money-db-schema.yaml` payment webhook processing/outbox 계약과 payment outbox delivery claim-lock skeleton을 검사한다. provider webhook event와 processing history append-only, raw provider payload 저장 금지, payment outbox 필수 필드, delivery status, bounded delivery attempt, `cloud_event_id`, `cloud_event_source`, `cloud_event_type`, aggregate/cloud-event-type/idempotency scope, `claimed_by`/`claim_token`/`claim_expires_at`/`row_version`, claim token/lease, claim token uniqueness, row-version compare-and-swap 기준이 사라지면 실패한다.

0.39.17부터 `ZDP-AUTH-ROUTE-001`이 `zdp-api-contracts`의 core-api auth/session route catalog와 auth/session schema bundle을 검사한다. registration, session issue/refresh/revoke, recovery, passkey, OAuth callback route, identity owner boundary, request_id/trace_id, session effect, credential policy, 민감 payload 금지값이 사라지면 실패한다.

0.39.63부터 `ZDP-API-CONTRACTS-001`과 `ZDP-AUTH-ROUTE-001`은 API 계약의 `raw_customer_payload`, `authorization_header`, `cookie_header`, `refresh_token_plaintext`, `stack_trace` 금지값, `route-catalog-contract-only` catalog status, SDK source contract의 auth/session schema bundle 포함 여부를 최신 `zdp-api-contracts` 기준으로 검사한다.

0.39.18부터 `ZDP-APP-001`은 `zdp-web-apps` auth route promotion 계약이 `zdp-api-contracts/contracts/apis/catalog.yaml`의 core-api auth/session operation 목록을 명시하되, live core runtime handoff와 product reviewer approval 전에는 route를 열지 않는 상태를 유지하는지 검사한다.

0.39.19부터 `ZDP-CORE-001`은 `zdp-core-platform` auth/session runtime handoff 계약이 `contracted_no_live_handler`, catalog source, 8개 auth/session operation, request/trace/idempotency/audit/session-store/credential-vault handoff, promotion blocker, plaintext refresh token 금지선을 유지하는지 검사한다.

0.39.35부터 `ZDP-CORE-001`은 `zdp-core-platform` auth runtime readiness summary 계약이 `readiness_summary_no_runtime_promotion`, `promotion_ready: false`, `production_route_ready: false`, required gate states, blocking summary, forbidden readiness claims를 유지하는지 검사한다. session store, credential vault handoff, passkey challenge store, OAuth callback state, audit persistence/storage adapter, idempotency, request/trace propagation, refresh token rotation, product reviewer approval gate는 durable implementation 또는 review proof가 없으면 계속 blocker로 남아야 한다. 이 summary는 blocker map이며 durable auth runtime, provider token exchange, DB migration, live handler, product route unblock proof가 아니다.

0.39.80부터 `ZDP-CORE-001`은 `zdp-core-platform` core runtime live auth integration review receipt가 `review_status: typed_integration_review_passed`를 유지하고 `promotion_blocker`를 남기지 않는지 검사한다. 이 검사는 SQLx runtime foundation, idempotency, transaction/outbox, audit, session, passkey, OAuth callback storage adapter 검토가 통과됐다는 뜻이지 live auth handler, provider token exchange, DB migration apply, product route unblock, product reviewer approval 통과를 의미하지 않는다.

0.39.81부터 `ZDP-CORE-001`은 `zdp-core-platform`의 `contracts/auth-product-review-approval.yaml` 계약과 auth runtime readiness의 product reviewer approval gate를 함께 검사한다. 이 계약은 `typed_product_approval_gate_receipt_no_route_unblock` receipt surface를 만들되 `product_reviewer_approval_present: false`, `product_approval_evidence_ref_present: false`, `no_product_reviewer_approval`, `live_auth_handler_enabled: false`, `provider_token_exchange_enabled: false`, `product_route_unblocked: false`를 유지해야 하며, approval receipt가 product route unblock이나 live auth handler 증거처럼 쓰이면 실패한다.

0.39.82부터 `ZDP-APP-001`은 `zdp-web-apps` auth route promotion 계약도 `zdp-core-platform contracts/auth-product-review-approval.yaml` receipt review, `typed_product_approval_gate_receipt_no_route_unblock`, `no_product_reviewer_approval`, `product_reviewer_approval_present`, `product_approval_evidence_ref_present` 조건을 명시해야 통과한다. 이 조건이 없으면 app shell이 product approval receipt 없이 login/signup/recovery/passkey/OAuth route를 열 수 있는 것처럼 보이므로 실패한다.

0.39.83부터 `ZDP-TOKEN-001`은 `zdp-token-protocol`의 `contracts/token-authority-matrix.yaml` 계약을 검사한다. lab-only 상태, Supply/Upgrade/Compliance/Emergency authority 분리, `TreasuryCap`/`UpgradeCap`/`DenyCapV2`/`MetadataCap`/`PauseCap`/migration/PAS policy capability 목록, capability별 owner/approver/signer threshold/timelock/rotation/revocation/monitoring/emergency replacement 필드, 무제한 `AdminCap` 금지, single hot wallet 금지, self-custody 기본값, managed custody 별도 gate가 사라지면 실패한다.

0.39.84부터 `ZDP-TOKEN-002`는 `zdp-token-indexer`의 `contracts/chain-fact-contract.yaml` 계약을 검사한다. lab-only 상태, checkpoint/effects/object-change/Move event/BCS payload source, chain fact 필수 필드, `chain.fact.observed`/`chain.fact.quarantined`, replay/quarantine 요구사항, signing/custody/ledger posting/mint-burn correction/customer-right 정본 금지, money consumption gate가 사라지면 실패한다.

0.39.85부터 `ZDP-TOKEN-003`은 `zdp-token-protocol`과 `zdp-token-indexer`의 `contracts/sui-api-selection.yaml` 계약을 검사한다. JSON-RPC baseline 금지, JSON-RPC legacy-only role, gRPC/GraphQL/Core API/archival provider 검토, 최신 공식 문서 review requirement, Sui SDK/API migration guide review requirement, archival provider policy, endpoint config single-source owner가 사라지면 실패한다.

0.39.86부터 `ZDP-TOKEN-004`는 money/core/product 서비스가 raw chain event 또는 token indexer datastore를 ledger, entitlement, customer-right command로 직접 소비하지 못하게 검사한다. `onchain_events_store` 또는 `zdp-token-indexer` 소유 datastore를 소비하거나 `data.raw_chain_event`를 선언한 대상 서비스는 `token.reconciliation_policy`, `token.idempotency_policy`, `token.package_version_allowlist`를 유지해야 하며 `token.raw_chain_event_direct_command: true`이면 실패한다.

0.39.87부터 `ZDP-TOKEN-005`는 `zdp-token-protocol`의 `contracts/package-upgrade-policy.yaml` 계약을 검사한다. original/latest package id, dependency/build digest manifest, old-version guard, migration plan, `PackageUpgraded`/`StateMigrated`/`OperationallyEnabled` event 분리, publish와 operational enablement 분리, pause/unpause approval split, rollback-forward-only 정책이 사라지면 실패한다.

0.39.88부터 `ZDP-TOKEN-006`은 `zdp-token-protocol`의 `contracts/token-identity.yaml` 계약을 검사한다. `ZDP_ENTITLEMENT`와 `ZDP_CREDIT`의 정본 분리, settlement/governance 초기 금지, money ledger chain-state 대체 금지, membership cash-equivalent 표현 금지, credit/settlement/governance 권리의 merged balance 금지가 사라지면 실패한다.

0.39.89부터 `ZDP-TOKEN-007`은 `zdp-token-protocol`의 `contracts/package-publication-record.yaml`와 `contracts/active-deployment-manifest.yaml` 분리 계약을 검사한다. package publication fact와 active deployment manifest 분리, publication이 active deployment를 암시하는 구조 금지, runtime credential 포함 금지, product repository env var로 package ID를 복붙 허용하는 계약 금지가 사라지면 실패한다.

0.39.90부터 `ZDP-TOKEN-008`은 `zdp-crypto-wallet`과 `zdp-token-operator`의 `contracts/custody-control-plane.yaml` 계약을 검사한다. lab-only custody posture, self-custody/managed-custodial/sponsor/treasury/capability wallet class 분리, signer owner/recovery/withdrawal approval/signer rotation/custody reconciliation/audit/capability scope 필수 통제, money/core/indexer/CI signer 금지, raw private key storage 금지가 사라지면 실패한다.

0.39.91부터 `ZDP-XCUT-SECRET-001`은 repository root의 public discovery artifact(`llms.txt`, `sitemap.xml`, `robots.txt`, `.well-known`, discovery JSON)를 검사한다. localhost/private-network/internal host URL, private/admin/internal/customer-data/ops/backoffice 경로, private key/API key/access token 형태 값, 채워진 secret assignment가 보이면 실패한다. 이 검사는 공개 artifact의 첫 tripwire이며, 런타임 응답·로그 redaction의 완전성 증명은 아니다.

0.39.92부터 `ZDP-AUTO-002`는 deploy unit 저장소에서 Renovate와 Dependabot이 동시에 dependency update owner가 되는 구성을 경고한다. `service.yaml`의 `automation.dependency_updates.renovate_enabled`와 `dependabot_enabled`가 둘 다 `true`이거나, repository root에 Renovate config와 `.github/dependabot.yml`/`.yaml`이 함께 있으면 실패가 아니라 warning으로 보고한다.

0.39.93부터 `ZDP-AUTO-004`는 deploy unit 저장소에서 release helper가 켜졌거나 release helper config가 있는데 `automation.release_helper.version_source_of_truth`와 `automation.release_helper.changelog_policy`가 빠진 경우 warning으로 보고한다. release helper config 증거는 `release-please-config.json`, `.release-please-manifest.json`, `.github/release-drafter.yml`/`.yaml`, release helper workflow 파일이다.

0.39.94부터 `ZDP-AUTO-005`는 issue form과 PR template이 비밀값, 결제 payload, 고객 원문 데이터 제출 금지를 안내하는지 warning으로 보고한다. 실제 `.github/ISSUE_TEMPLATE`과 PR template 파일 본문뿐 아니라 `service.yaml`의 `automation.templates.issue_forms_secret_warning`, `pr_template_secret_warning`, `forbidden_submission_classes`도 함께 검사한다.

0.39.95부터 `ZDP-AUTO-006`은 `automation.auto_merge.enabled`가 `true`인 deploy unit 저장소에서 `required_checks`가 비어 있거나, `owner_review_required`가 `true`가 아니거나, `major_update_allowed`가 `false`가 아니면 warning으로 보고한다.

0.39.96부터 `ZDP-AUTO-007`은 `automation.stale_bot.enabled`가 `true`인 deploy unit 저장소에서 `exempt_labels`가 `bug`와 `security`를 포함하지 않거나, `security_issue_auto_close_allowed`가 `false`가 아니면 warning으로 보고한다.

0.39.112부터 `ZDP-AUTO-008`은 `zdp-desktop-tauri`와 `zdp-desktop-wails`의 수동 desktop-shell evidence CI 계약을 검사한다. `automation.ci.workflow_names`, 실제 GitHub Actions workflow, short-lived evidence artifact, Wails의 Tauri baseline checkout fallback, release/native activation으로 오해될 수 있는 트리거와 명령 drift를 warning으로 보고한다.

0.39.113부터 `diff` 명령은 head snapshot 생성 실패 시에도 이미 생성한 base snapshot 임시 디렉터리를 정리한다. `doctor` 명령의 Git 호출은 큰 작업 트리에서도 기본 buffer 한계로 중단되지 않도록 명시적인 buffer와 timeout을 사용한다.

0.39.97부터 `ZDP-XCUT-TIME-001`은 repository root의 `service.yaml`, `product-spec.md`, `BOUNDARY.md`, `RUNBOOK.md`, `contracts/**`, `schemas/**`에서 시간 계약의 첫 tripwire를 검사한다. `timestamp without time zone`, timestamp field의 모호한 `datetime` 타입, timestamp 예시의 non-UTC offset 또는 timezone 없는 ISO 값, `KST` 같은 local timezone label, locale formatting으로 만든 boundary timestamp, recurring/cron/wall-time 계약의 `timezone` 누락이 보이면 실패한다. 이 검사는 계약·스키마·소스에 드러난 명백한 drift를 막는 gate이며, 런타임 clock source나 모든 로그 formatter의 완전성 증명은 아니다.

0.39.98부터 `ZDP-XCUT-ERROR-001`은 repository root의 `service.yaml`, `product-spec.md`, `openapi.*`, `swagger.*`, `contracts/**`, `schemas/**`에서 공개 API 오류 envelope의 첫 tripwire를 검사한다. 공개 API 저장소나 오류 계약 파일이 raw string `error`, top-level message-only 오류 예시, 또는 `error` 객체의 `code`, `message`, `request_id` 선언 누락을 보이면 실패한다. 이 검사는 계약·스키마에 드러난 명백한 drift를 막는 gate이며, 모든 런타임 handler의 오류 매핑 완전성 증명은 아니다.

0.39.99부터 `ZDP-XCUT-I18N-001`과 `ZDP-XCUT-I18N-002`는 repository root의 `service.yaml`, `product-spec.md`, `i18n-contract.*`, `localization-contract.*`, `contracts/**`, `schemas/**`, `messages/**`, `locales/**`, `src/messages/**`에서 국제화 계약의 첫 tripwire를 검사한다. 사용자-facing 저장소가 message key 또는 localization 계약을 전혀 밝히지 않거나, 계약 파일에 literal `button_label`, `title`, `placeholder` 같은 UI 문구 필드를 message key 없이 두면 실패한다. `active_locales`나 active locale 계약을 선언하면서 production fallback message 0개 증거를 밝히지 않아도 실패한다. 이 검사는 계약 표면에 드러난 명백한 drift를 막는 gate이며, 모든 화면 문자열 추출, 번역 품질, 런타임 fallback 완전성 증명은 아니다.

0.39.100부터 `ZDP-XCUT-FEED-001`은 repository root의 `service.yaml`, `product-spec.md`, `webpub.toml`, `feed.xml`, `rss.xml`, `atom.xml`, `feed.json`, `public/**`, `static/**`, `src/pages/**`, `src/routes/**`, `routes/**`, `functions/**`, `api/**`, `contracts/**`, `schemas/**`에서 RSS/Atom/JSON Feed 계약의 첫 tripwire를 검사한다. 정적 XML/JSON feed 산출물과 `prerender = true` feed route는 통과한다. `+server` route, functions/API route, `prerender = false`, 또는 service contract의 runtime feed 선언이 보이면 `service.yaml`에 runtime feed exception reason, feed cost policy, feed cache policy가 함께 있어야 한다. 이 검사는 runtime feed 비용 누수를 계약 표면에서 막는 gate이며, 모든 빌드 산출물 생성이나 CDN 캐시 동작의 완전성 증명은 아니다.

0.39.101부터 `ZDP-XCUT-COLOR-001`은 repository root의 `service.yaml`, `product-spec.md`, `design-tokens.json`, `tokens.css`, `tailwind.config.*`, `src/styles/**`, `styles/**`, `tokens/**`, `contracts/**`, `schemas/**`에서 색상·테마·디자인 토큰 계약의 첫 tripwire를 검사한다. raw `hex`/`rgb`/`hsl` 색상 fallback은 token source가 `oklch()` 원천과 semantic/component token 계층을 함께 드러낼 때만 통과한다. 일반 style source가 색상 property에 raw color를 직접 쓰거나, `filter: invert()`로 dark mode를 만들거나, P3 색상을 `@media (color-gamut: p3)` gate 없이 쓰면 실패한다. 이 검사는 제품 코드의 raw color drift를 계약 표면에서 막는 gate이며, 모든 component inline style, contrast ratio, theme rendering 완전성 증명은 아니다.

0.39.102부터 `ZDP-XCUT-A11Y-001`은 repository root의 `service.yaml`, `product-spec.md`, `a11y-contract.*`, `accessibility-contract.*`, `src/routes/**`, `src/pages/**`, `src/lib/components/**`, `src/components/**`, `components/**`, `contracts/**`, `schemas/**`에서 접근성·화면 상태 계약의 첫 tripwire를 검사한다. 사용자-facing 저장소의 stateful UI surface가 loading, empty, error, data 상태와 기본 접근성 연결 증거를 함께 밝히지 않으면 실패한다. native input이 label/aria 연결 없이 보이거나, icon-only native button이 accessible name 없이 있거나, non-interactive element에 click handler만 붙어 있으면 실패한다. 이 검사는 계약·소스에 드러난 명백한 drift를 막는 gate이며, 브라우저 accessibility tree, 실제 focus order, color contrast, 스크린 리더 동작의 완전성 증명은 아니다.

0.39.103부터 `ZDP-XCUT-PERF-001`은 repository root의 `service.yaml`, `product-spec.md`, `performance-contract.*`, `web-performance-contract.*`, `contracts/**`, `schemas/**`에서 성능 예산과 측정 방법 계약의 첫 tripwire를 경고로 검사한다. 사용자-facing 공개 웹, 인증 UI, 로그인 이후 앱 셸이 LCP, INP, CLS, 초기 JS gzip, bundle/asset budget, p95 latency 같은 예산과 Lighthouse, WebPageTest, Core Web Vitals/RUM, bundle analyze, CI build/check gate 같은 측정 방법을 함께 밝히지 않으면 경고한다. 이 검사는 계약 표면의 명백한 누락을 드러내는 gate이며, 실제 Lighthouse 점수, field data, 모든 route별 bundle 분석의 완전성 증명은 아니다.

0.39.104부터 `ZDP-XCUT-SECHEADER-001`은 repository root의 `service.yaml`, `product-spec.md`, `webpub.toml`, `security-header-contract.*`, `security-headers-contract.*`, `contracts/**`, `schemas/**`에서 기본 보안 헤더 계약의 첫 tripwire를 경고로 검사한다. 사용자-facing 공개 웹, 인증 UI, 로그인 이후 앱 셸이 Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors 또는 X-Frame-Options를 밝히지 않으면 경고한다. CSP에서 `unsafe-inline` 또는 `unsafe-eval`을 쓰면서 nonce, hash, reviewed exception reason이 없을 때도 경고한다. 이 검사는 계약 표면의 명백한 누락을 드러내는 gate이며, 실제 CDN/Worker header injection이나 브라우저 적용 상태의 완전성 증명은 아니다.

0.39.105부터 `ZDP-XCUT-ASSET-001`은 repository root의 `assets/**`, `brand/**`, `media/**`, `public/**`, `static/**`, `src/assets/**`, `src/content/**`, `src/lib/assets/**`에서 제품·사용자-facing 저장소가 원본 디자인 파일, 대형 raster 이미지, 대형 비디오 파일을 직접 소유하는지 경고로 검사한다. `.psd`, `.ai`, `.fig`, `.sketch`, `.tiff`, `.raw` 같은 원본 파일은 크기와 무관하게 경고하고, 1MB 초과 raster와 2MB 초과 video는 asset manifest, optimized public URL, CDN URL, media pipeline으로 옮기도록 경고한다. 이 검사는 저장소 안에 들어온 명백한 원본·대형 파일을 잡는 gate이며, 모든 CDN 변환, 이미지 품질, LCP 이미지 delivery의 완전성 증명은 아니다.

0.39.106부터 `ZDP-XCUT-LLMS-001`은 repository root의 `llms.txt`, `public/llms.txt`, `static/llms.txt`, `src/content/llms.txt`에서 LLM discovery guide가 curated public guide로 남아 있는지 경고로 검사한다. `llms.txt`가 sitemap XML을 그대로 복사하거나, 공개 링크를 20개 넘게 담거나, localhost/private-network/internal/admin/customer-data/ops/backoffice URL을 포함하면 경고한다. 이 검사는 `llms.txt`의 명백한 sitemap 복붙과 내부 URL 노출을 잡는 gate이며, 공개 문서 품질, 검색 노출, 모든 private route redaction의 완전성 증명은 아니다.

0.39.107부터 architecture fail fixture validation은 DATA catalog refs/ownership(`ZDP-DATA-003/005`)과 repository service event refs/delivery policy(`ZDP-SERVICE-EVENT-001/002`)도 fixture expectation으로 검증한다. 이로써 `fixtures/fail/**`에서 AI sensitive data, AI non-owned datastore access, DATA refs/ownership, service event schema/delivery, tier2 운영 계약, risky tier3 운영 계약 회귀 케이스를 고정한다.

0.39.108부터 `fixtures/repository-service/{pass,fail}/**/*.yaml`은 `service_contract` 객체를 실제 repository root `service.yaml` semantic reference validator에 태운다. 첫 용도는 `ZDP-REF-009`처럼 `service.yaml`의 `service.id`/`service.repo`가 `catalogs/services.yaml`와 어긋나는 repo-root drift를 architecture fixture로 고정하는 것이다. 이 fixture harness는 전체 `service.yaml` JSON Schema fixture가 아니라 catalog reference, data/provider/event reference, domain semantic drift를 재현하는 얇은 gate다.

0.39.109부터 `ZDP-REPO-REVIEW-001`은 `catalogs/repositories.yaml`의 `agent_review` 계약을 검사한다. `included` 저장소는 `playbook_repo`, `group_id`, `cadence`, `run_scope`, `output_policy`를 유지해야 하고, `candidate`/`paused`/`excluded`/`removed`는 사람이 판단할 `reason`을 남겨야 한다. `normalize` registry의 repository node는 `agentReview`를 포함하고, `list repos`는 `--agent-review-status <status>` 필터와 `agentReviewStatus` 출력을 제공한다.

0.39.110부터 `ZDP-DATA-PLATFORM-001`은 `zdp-data-platform`의 `contracts/operational-metrics.yaml`와 `service.yaml`의 `observability.operational_metrics`가 같은 Prometheus 운영 메트릭 이름을 유지하는지 검사한다. repo-local checker source와 테스트가 operational metric contract drift, Go runtime metric drift 검사를 잃어도 실패한다. 이 검사는 runtime readiness의 운영 메트릭 tripwire이며, 실제 collector 연결, ClickHouse writer, 대시보드 수집 완료를 의미하지 않는다.

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

0.39.62부터 `ZDP-CORE-001`은 `zdp-core-platform` core event outbox 계약이 `migration_shape_declared_no_dispatcher`, dispatcher/replay/consumer 미구현 상태, CloudEvents source, money-relevant event 목록, append-only outbox/delivery attempt table, payload reference only, required outbox/delivery fields, dispatcher-ready claim 금지 기준을 유지하는지 검사한다. 0.39.70부터는 `contracts/core-db-schema.yaml`와 `migrations/postgresql/0001_core_foundation.sql`도 함께 읽어 `schema_version` 양의 정수 제약, outbox/delivery attempt table 이름, append-only evidence를 검사한다. 이 상태는 dispatcher, replay worker, consumer inbox, production route unblock이 구현됐다는 뜻이 아니다.

0.39.24부터 `ZDP-CORE-001`은 auth audit event persistence 상태를 `append_receipt_gate_no_durable_store`로 올리고, `outcome`, `request_id`, `transaction_or_outbox_ref` 필드를 필수로 검사한다. 이 상태는 성공 응답 전 append receipt gate가 있다는 뜻이지 durable append-only adapter나 DB migration이 있다는 뜻은 아니다.

0.39.26부터 `ZDP-CORE-001`은 `zdp-core-platform` GitHub Actions CI workflow가 stable Rust toolchain, `rustfmt`, `cargo fmt --check`, `cargo check --locked --all-targets`, `cargo test --locked` 계약을 유지하는지 검사한다. 0.39.70부터 checkout action 기준은 `actions/checkout@v7`이다.

0.39.25부터 `ZDP-CORE-001`은 `zdp-core-platform` auth audit storage adapter 계약이 `contract_only_no_adapter`, audit owner boundary, `contracts/auth-audit-event-persistence.yaml` source contract, append-only table 또는 transactional outbox adapter kind, storage/transaction/receipt/replay/review reference, append-only/unique-event enforcement, transaction/outbox atomicity, audit write failure 차단, redaction/raw-payload gate, raw credential/provider payload 금지 기준을 유지하는지 검사한다. 이 상태는 durable adapter나 DB migration 구현 완료를 의미하지 않는다.

0.39.23부터 `ZDP-CORE-001`은 `zdp-core-platform` auth idempotency storage 계약이 `contract_only_no_storage`, identity owner boundary, scoped idempotency record, request fingerprint replay/conflict, in-progress duplicate suppression, TTL, atomic claim/unique constraint, audit reference, raw payload/secret 저장 금지 기준을 유지하는지 검사한다.

0.39.30부터 `ZDP-CORE-001`은 auth idempotency storage 계약의 `audit_event_ref` record field와 `typed_adapter_boundary_no_migration` adapter boundary도 검사한다. atomic unique claim table 또는 transactional idempotency record adapter kind, transaction/claim/replay/conflict/review reference, atomic claim/conflict, TTL, raw payload 금지, audit event reference 기준이 사라지면 실패한다. 이 상태는 durable storage implementation이나 DB migration 완료를 의미하지 않는다.

0.39.0부터 실제 저장소 루트 검사는 `.editorconfig`와 `.gitattributes`의 최소 줄바꿈 정책, `RUNBOOK.md`, `SECURITY.md`, `BOUNDARY.md`, `product-spec.md` 조건부 루트 Markdown도 함께 검사한다. 새 진단 ID는 `ZDP-REPO-MARKDOWN-003`, `ZDP-REPO-MARKDOWN-004`, `ZDP-REPO-MARKDOWN-005`, `ZDP-REPO-MARKDOWN-006`이다.

0.39.5부터 `ZDP-LOCALIZATION-001`이 `zdp-platform-localization`의 필수 내부 package set, `@zdp/localization-*` package name, `private: true`, `zdp-localization` CLI bin 계약도 검사한다. `check-internal-posture`가 package missing/name/bin drift 진단을 잃으면 실패한다.

0.39.8부터 `ZDP-LOCALIZATION-001`이 `zdp-platform-localization`의 `check:adoption` non-browser gate, fixture catalog diagnostics 0건, generated large-catalog diagnostics 0건, production zero-fallback manifest, large-catalog route-scope ratio 25% 기준, HMR 별도 검증 경계와 내부 전용 posture를 검사한다. Dora branding, 공개 npm/publish 문구, open source escape-hatch 문구, open source conversion 고려 문구, README/AGENTS/ADR의 내부 전용 선언이 사라지면 실패한다. `ZDP-APP-001`은 `zdp-web-apps` app shell service contract가 `platform-localization` 의존성과 provider `check:adoption` 선행 조건을 유지하는지도 검사한다.

0.39.9부터 `ZDP-WEBPUB-001`이 `zdp-web-public`에서 앱 패키지 또는 zero-fallback/glossary 운영 gate가 선언된 경우 `package.json` check wiring, `scripts/check-localization.ts` strict production compile, `scripts/check-glossary.ts` stale manifest check, `scripts/glossary-build.ts`의 reviewed public terms, click-open Term Sheet placement, hover-card ad exclusion, Term Sheet ad exclusion/detail-page experiment helper, `service.yaml`의 운영 계약 문구를 검사한다. 루트 계약만 가진 초기 공개 웹 scaffold는 `webpub.toml` 발행 계약만 검사한다.

0.39.10부터 `ZDP-XCUT-TERM-ADS-001`, `ZDP-XCUT-TERM-ADS-002`, `ZDP-XCUT-TERM-001`, `ZDP-XCUT-TERM-007`이 repository-level glossary/Term Sheet 계약을 검사한다. `service.yaml`, `glossary/terms`, `src/content/glossary-manifest.json` 중 하나가 용어 설명 표면을 선언하면 hover 광고 슬롯과 Term Sheet 광고 슬롯/provider는 error, `term_id` 누락과 generated manifest YAML source 누락은 warning으로 보고한다.

0.39.12부터 `ZDP-WEBPUB-001`은 `zdp-web-public` localization canary가 home hero title과 CTA 메시지로 제한되고 static Astro copy rollback boundary와 runtime feature flag 불필요 계약을 유지하는지 검사한다. 0.39.121부터 web-public CI의 모든 외부 Action을 full commit SHA로 고정하고 모든 checkout에서 `persist-credentials: false`를 요구한다. `ZDP-APP-001`은 `zdp-web-apps`의 `contracts/app-shell.yaml`에서 `localization_canary` scope, 6개 app-shell message key, expansion review, rollback boundary, runtime feature flag 불필요 계약을 검사한다.

0.39.13부터 `ZDP-APP-001`은 `zdp-web-apps`의 GitHub Actions CI workflow가 private `zdp-platform-localization` checkout용 `ZDP_CI_READ_TOKEN`, provider workspace install, app install, `bun run check`, `bun run build` 계약을 유지하는지도 검사한다. 0.39.120부터 외부 Action은 full commit SHA로 고정하고 모든 `actions/checkout` step은 `persist-credentials: false`로 credential persistence를 꺼야 한다.

0.39.14에서 `ZDP-WEBPUB-001`은 `zdp-web-public`의 GitHub Actions CI에 sibling `zdp-design-system`과 `zdp-platform-localization` checkout, design-system package build, public site check/build 계약을 처음 도입했다. 0.39.119부터 공개 `zdp-design-system`은 npm registry package range, Bun lock SHA-512, 실제 설치 버전으로 검증하며 sibling checkout과 `package:build`는 오히려 실패한다. private `zdp-platform-localization` checkout용 `ZDP_CI_READ_TOKEN`, `actions/checkout@v7`, provider workspace install, public site install, `bun run check`, `bun run build` 계약은 계속 유지한다.

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
bun src/cli.ts list repos --architecture <zdp-architecture-path> --stage deploy_unit --agent-review-status included --json
bun src/cli.ts list services --architecture <zdp-architecture-path> --repo zdp-core-platform --json
```

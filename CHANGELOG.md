# 변경 내역

## 0.39.23

- `ZDP-CORE-001`이 `zdp-core-platform`의 `contracts/auth-idempotency-storage.yaml`을 검사하도록 강화했다.
- auth/session side effect 성공 전에 scoped idempotency record, request fingerprint replay/conflict, in-progress duplicate suppression, TTL, atomic claim/unique constraint, audit reference, raw payload/secret 저장 금지 기준을 잃으면 실패한다.

## 0.39.22

- `ZDP-CORE-001`이 `zdp-core-platform`의 `contracts/auth-audit-event-persistence.yaml`을 검사하도록 강화했다.
- auth/session 성공 승격 전에 append-only audit persistence, command/idempotency/request/trace reference, redacted summary, privileged evidence ref, audit write failure 차단, raw credential/provider payload 금지 기준을 잃으면 실패한다.

## 0.39.21

- `ZDP-CORE-001`이 `zdp-core-platform`의 `contracts/auth-credential-vault-handoff.yaml`을 검사하도록 강화했다.
- credential vault handoff가 capability ref와 metadata만 넘기고, short-lived scope, request/trace/idempotency/audit reference, raw secret 반환 금지, vault access audit 기준을 잃으면 실패한다.

## 0.39.20

- `ZDP-CORE-001`이 `zdp-core-platform`의 `contracts/identity-session-store.yaml`을 검사하도록 강화했다.
- session id, tenant/subject scope, refresh token family/hash, rotation/reuse detection, revocation, TTL, command idempotency, audit reference, plaintext token/secret 금지 계약이 사라지면 실패한다.

## 0.39.19

- `ZDP-CORE-001`이 `zdp-core-platform`의 `contracts/auth-session-runtime.yaml`을 검사하도록 강화했다.
- core auth/session operation이 `contracted_no_live_handler` 상태, catalog source, request/trace/idempotency/audit/session-store/credential-vault handoff, promotion blocker, refresh token plaintext와 provider secret 금지선을 잃으면 실패한다.

## 0.39.18

- `ZDP-APP-001`이 `zdp-web-apps`의 auth route promotion 계약에서 core-api auth/session route catalog source와 8개 required operation, live runtime handoff와 product review 전 route 차단 상태를 유지하는지 검사하도록 강화했다.

## 0.39.17

- `ZDP-AUTH-ROUTE-001`을 추가해 `zdp-api-contracts`의 core-api auth/session route catalog가 registration, session issue/refresh/revoke, recovery, passkey, OAuth callback 계약과 owner/tenant/request/trace/session/credential metadata를 유지하는지 검사한다.
- auth/session payload schema bundle이 contract-only 상태와 identity owner boundary, request_id/trace_id/idempotency_key envelope, refresh token plaintext와 provider secret 금지값을 잃으면 실패하도록 했다.

## 0.39.13

- `ZDP-APP-001`이 `zdp-web-apps`의 GitHub Actions CI workflow에서 private `zdp-platform-localization` checkout, `ZDP_CI_READ_TOKEN`, provider workspace install, app install, `bun run check`, `bun run build` 계약이 유지되는지 검사하도록 강화했다.

## 0.39.12

- `ZDP-WEBPUB-001`이 `zdp-web-public` localization canary를 home hero title과 CTA 메시지로 제한하고, static Astro copy rollback boundary와 runtime feature flag 불필요 계약을 검사하도록 강화했다.
- `ZDP-APP-001`이 `zdp-web-apps`의 `contracts/app-shell.yaml` 안에 `localization_canary` scope, 6개 app-shell message key, expansion review, rollback boundary, runtime feature flag 불필요 계약이 유지되는지 검사하도록 강화했다.

## 0.39.11

- `ZDP-WEBPUB-001`의 glossary 광고 계약을 Term Sheet 광고 슬롯 금지와 별도 detail-page experiment 계약 기준으로 조정했다.
- `zdp-web-public` glossary builder가 Term Sheet 광고를 금지하고 detail-page 예약 helper를 유지하는지 검사하도록 바꿨다.

## 0.39.10

- `ZDP-XCUT-TERM-ADS-001`, `ZDP-XCUT-TERM-ADS-002`, `ZDP-XCUT-TERM-001`, `ZDP-XCUT-TERM-007` repository gate를 추가했다.
- glossary/Term Sheet 표면을 선언한 저장소에서 hover 광고 슬롯, 기본 off/명시적 실험 없는 Term Sheet 광고 provider, term_id 누락, generated manifest source 누락을 잡는다.

## 0.39.9

- `ZDP-WEBPUB-001`이 `zdp-web-public`의 glossary builder가 reviewed public terms, click-open Term Sheet placement, hover-card ad exclusion, reserved/off ad policy helpers를 유지하는지 검사하도록 강화했다.
- `zdp-web-public` service contract가 Term Sheet 광고 슬롯 기본 off와 명시적 실험 선행 조건을 잃으면 repository validation에서 실패한다.

## 0.39.8

- `ZDP-LOCALIZATION-001`이 `zdp-platform-localization`의 내부 전용 posture를 더 강하게 검사하도록 조정했다.
- `check-internal-posture`가 open source conversion을 고려 대상이나 미래 후보로 표현하는 문구까지 차단해야 repository validation을 통과한다.

## 0.39.7

- `ZDP-APP-001`이 `zdp-web-apps` app shell service contract의 `platform-localization` 의존성과 provider `check:adoption` 선행 조건을 검사하도록 강화했다.
- app shell service contract가 fixture catalog diagnostics 0건, generated large-catalog diagnostics 0건, production fallback 0건 기준을 잃으면 repository validation에서 실패한다.

## 0.39.6

- `ZDP-LOCALIZATION-001`이 `check:adoption`의 generated large-catalog diagnostics 0건 증거와 `large-catalog-diagnostic-checks` 운영 metric을 요구하도록 강화했다.
- `zdp-platform-localization`의 large-catalog measurement가 `zdp.localization.large-catalog-measurement@1` protocol 이름을 유지하는지 검사한다.

## 0.39.5

- `ZDP-LOCALIZATION-001`이 `zdp-platform-localization`의 필수 내부 package set, `@zdp/localization-*` package name, `private: true`, `zdp-localization` CLI bin 계약을 검사하도록 강화했다.
- `check-internal-posture`가 package missing/name/bin drift 진단을 잃으면 repository validation에서 실패한다.

## 0.39.4

- `ZDP-WEBPUB-001`이 `zdp-web-public`의 앱 패키지 또는 zero-fallback/glossary 운영 gate 선언 이후 `check:localization` zero-fallback production compile gate와 glossary stale-manifest gate를 검사하도록 강화했다.
- 루트 계약만 가진 초기 공개 웹 scaffold는 앱 checker 파일 없이도 `webpub.toml` 발행 계약 검증을 통과하도록 조정했다.
- `package.json`의 `check`, `check:localization`, `check:glossary`, `glossary:generate` wiring과 `scripts/check-localization.ts`, `scripts/check-glossary.ts`, `service.yaml` 운영 계약 문구가 drift하면 repository validation에서 실패한다.

## 0.39.3

- `ZDP-LOCALIZATION-001`이 `zdp-platform-localization`의 내부 전용 posture까지 검사하도록 강화했다.
- `check-internal-posture`의 Dora branding 금지, 공개 npm/publish 금지, open source escape-hatch 금지, README/AGENTS/ADR의 "open source conversion is not a roadmap item" 문구가 사라지면 repository validation에서 실패한다.

## 0.39.2

- `ZDP-LOCALIZATION-001`을 추가해 `zdp-platform-localization`의 `check:adoption` non-browser gate, zero-fallback production compile, large-catalog route-scope ratio 25% 기준, HMR 별도 검증 경계를 검사한다.

## 0.39.1

- `check:tsgo` fast typecheck 스크립트와 pinned `@typescript/native-preview` 의존성을 추가했다.

## 0.39.0

- `ZDP-REPO-BASELINE-001`이 `.editorconfig`와 `.gitattributes`의 최소 줄바꿈 정책 문구까지 검사하도록 강화했다.
- `ZDP-REPO-MARKDOWN-003`부터 `ZDP-REPO-MARKDOWN-006`까지 추가해 운영 저장소의 `RUNBOOK.md`, 민감 저장소의 `SECURITY.md`, 경계가 두꺼운 저장소의 `BOUNDARY.md`, 제품 저장소의 `product-spec.md` 누락을 차단한다.
- 이 검사로 `zdp-platform-devex`가 만든 초기 저장소 골격이 루트 문서만 있는 빈 껍데기로 통과하지 않고, 위험도·tier·데이터 접근 경계에 맞는 운영 문서를 갖췄는지 확인한다.

## 0.38.5

- `ZDP-RUNTIME-001`이 `platform-observability-contracts` one-shot contract check target을 요구한다.
- 이 검사로 runtime promotion 전에 관측성 계약이 provider dashboard, provider token, dashboard URL, raw log, raw trace에 기대는지 확인하고, telemetry/dashboard/alert 계약 checker가 유지되도록 했다.

## 0.38.4

- `ZDP-RUNTIME-001`이 `platform-infra-contracts` one-shot contract check target을 요구한다.
- 이 검사로 runtime promotion 전에 인프라 계약이 provider 계정, 서버 IP, DNS 인증값, Terraform/OpenTofu state에 기대는지 확인하고, provider-neutral dry-run plan이 유지되도록 했다.

## 0.38.3

- `ZDP-INFRA-001`이 `zdp-platform-infra`의 repo-local infra contract checker와 provider-neutral dry-run plan skeleton을 요구한다.
- 이 검사로 인프라 계약이 문서에만 남는 문제를 막고, provider 계정 연결 전에도 resource inventory, environment schema, backup/restore 기준을 기계적으로 재현할 수 있게 했다.

## 0.38.2

- `ZDP-RUNTIME-001`이 `platform-security-contracts` one-shot contract check target을 요구한다.
- 이 검사로 `/healthz` 없는 보안 정책 저장소를 가짜 HTTP 서비스로 위장하는 일을 막고, runtime plan에서 보안 계약 검증 누락을 바로 잡을 수 있게 했다.

## 0.38.1

- `ZDP-SECURITY-001`이 `zdp-platform-security`의 repo-local checker skeleton까지 검사하도록 강화했다.
- security package scripts와 `scripts/check-security-contracts.ts`, checker source, checker test 표면을 검증한다.

## 0.38.0

- `ZDP-SECURITY-001`을 추가해 `zdp-platform-security`의 security baseline, threat model template, secret handling, dependency review 계약을 repository validate gate로 검사한다.
- 보안 리뷰가 raw secret, provider account id, 고객 payload, exploit payload, private incident evidence를 repo 증거로 남기거나 critical path dependency review 없이 promotion되는 구조를 차단한다.

## 0.37.7

- `ZDP-RUNTIME-001`이 runtime smoke target에 `connectors-platform`을 요구하도록 강화했다.
- `connectors-platform`의 `/healthz`, `/readyz`, contracts readiness, 실제 OAuth provider·원문 source payload·평문 credential 없는 smoke 경계를 검증한다.

## 0.37.6

- `ZDP-CONNECTORS-001`이 `zdp-connectors-platform`의 최소 Rust/Axum skeleton까지 검사하도록 강화했다.
- `/healthz`, `/readyz`, `ZDP_CONNECTORS_BIND_ADDR`, provider registry/sync-state/webhook replay/provider boundary marker, plaintext credential/raw source/final product decision 금지 표면을 검증한다.

## 0.37.5

- `ZDP-CREDENTIAL-001`이 `zdp-privacy-credential-vault`의 최소 Rust/Axum skeleton까지 검사하도록 강화했다.
- `/healthz`, `/readyz`, `ZDP_CREDENTIAL_VAULT_BIND_ADDR`, boundary marker, plaintext export/connector cache/audit restore secret 금지 표면을 검증한다.

## 0.37.4

- `ZDP-PRIVACY-001`이 `zdp-privacy-access-broker`의 최소 Rust/Axum skeleton까지 검사하도록 강화했다.
- `/healthz`, `/readyz`, `ZDP_PRIVACY_BROKER_BIND_ADDR`, boundary marker, raw source/credential/final authorization 금지 표면을 검증한다.

## 0.37.3

- `ZDP-PRIVACY-001`이 `zdp-privacy-access-broker`의 repo-local checker skeleton까지 검사하도록 강화했다.
- privacy broker package scripts와 `scripts/check-privacy-contracts.ts`, checker source, checker test 표면을 검증한다.

## 0.37.2

- `ZDP-CREDENTIAL-001`이 `zdp-privacy-credential-vault`의 repo-local checker skeleton까지 검사하도록 강화했다.
- credential vault package scripts와 `scripts/check-credential-vault-contracts.ts`, checker source, checker test 표면을 검증한다.

## 0.37.1

- `ZDP-CONNECTORS-001`이 `zdp-connectors-platform`의 repo-local checker skeleton까지 검사하도록 강화했다.
- connectors package scripts와 `scripts/check-connectors-contracts.ts`, checker source, checker test 표면을 검증한다.

## 0.37.0

- `ZDP-CONNECTORS-001`을 추가해 `zdp-connectors-platform`의 provider registry, sync-state, webhook replay, provider boundary 계약을 repository validate gate로 검사한다.
- Provider 연동이 credential vault capability, privacy broker scope, replay idempotency, request/trace 전파 없이 열리거나 connector가 raw token/source payload와 final authorization, entitlement, ledger, privacy policy 판단을 소유하는 구조를 차단한다.

## 0.36.0

- `ZDP-CREDENTIAL-001`을 추가해 `zdp-privacy-credential-vault`의 credential boundary, capability issuance, access audit, storage boundary 계약을 repository validate gate로 검사한다.
- OAuth refresh token, webhook secret, provider credential 원문이 connector/product/AI/analytics 경계로 새거나 audit/restore/log에 raw secret 값이 남는 구조를 차단한다.

## 0.35.10

- `ZDP-CLIENT-SDKS-001`이 `zdp-client-sdks`의 API export dry-run plan handoff 검증 표면까지 검사하도록 강화했다.
- SDK generation plan이 OpenAPI, SDK input, docs contract, webhook schema 계획과 `request_id`, `trace_id`, dry-run 보장을 보지 않으면 실패하도록 했다.

## 0.35.9

- `ZDP-API-CONTRACTS-001`이 `zdp-api-contracts`의 API export dry-run plan skeleton과 `export:plan` script까지 검사하도록 강화했다.
- OpenAPI, SDK input, docs contract, webhook schema 계획이 권한, 감사, 멱등성, `request_id`, `trace_id` metadata를 같이 유지하지 못하면 실제 생성기 구현 전부터 실패하도록 했다.

## 0.35.8

- `ZDP-LIBS-001`이 `zdp-libs-ts`의 API source input drift 검증 표면까지 검사하도록 강화했다.
- `contracts:check --api-contracts-root ../zdp-api-contracts`, `src/libs-contracts/api-source.ts`, API route/error/webhook/SDK input handoff 실패 테스트가 사라지면 실패하도록 했다.

## 0.35.7

- `ZDP-CLIENT-SDKS-001`이 `zdp-client-sdks`의 API SDK generation input drift 검증 표면까지 검사하도록 강화했다.
- `generation:plan`이 `zdp-api-contracts/contracts/sdk-generation-input.yaml`을 읽지 않거나 route/error/webhook metadata drift 실패 테스트가 사라지면 실패하도록 했다.

## 0.35.6

- `ZDP-CLIENT-SDKS-001`이 `zdp-client-sdks`의 SDK generation dry-run plan skeleton과 `generation:plan` script까지 검사하도록 강화했다.
- SDK plan source/test/script가 사라지면 실제 SDK 생성기를 붙이기 전부터 API 계약, libs export, request/trace/idempotency 입력이 drift난 것으로 실패하도록 했다.

## 0.35.5

- `ZDP-CLIENT-SDKS-001`이 `zdp-client-sdks`의 `zdp-libs-ts` public export source handoff 계약까지 검사하도록 강화했다.
- SDK가 `zdp-libs-ts/schema`, `env-contract`, `event-contracts`, `error`, `i18n-contract` export와 trace/request/error/message metadata를 잃거나 provider token 같은 민감값을 SDK 입력으로 허용하면 실패하도록 했다.

## 0.35.4

- `ZDP-LIBS-001`이 `zdp-libs-ts`의 최소 public export skeleton까지 검사하도록 강화했다.
- `schema`, `env-contract`, `event-contracts`, `error`, `i18n-contract` subpath export와 public export 테스트 표면이 사라지면 실패하도록 했다.

## 0.35.3

- `ZDP-LIBS-001`이 `zdp-libs-ts`의 API contract source handoff 계약까지 검사하도록 강화했다.
- `zdp-api-contracts` source repo/contract, handoff metadata, `idempotency`, `trace_id`, authorization header와 raw customer payload 금지값이 사라지면 실패하도록 했다.

## 0.35.2

- `ZDP-CLIENT-SDKS-001`이 `zdp-client-sdks`의 SDK generation source handoff 계약까지 검사하도록 강화했다.
- SDK source repo/contract, TypeScript/Dart/Rust target, route `idempotency`, error `trace_id`, webhook dead-letter policy, authorization header 금지값이 사라지면 실패하도록 했다.

## 0.35.1

- `ZDP-API-CONTRACTS-001`이 `zdp-api-contracts`의 SDK generation input 계약까지 검사하도록 강화했다.
- SDK source contract, TypeScript/Dart/Rust target, route/error/webhook metadata, generated SDK source 미소유, final authorization 미소유, authorization header 금지값이 사라지면 실패하도록 했다.

## 0.35.0

- `ZDP-CLIENT-SDKS-001`을 추가해 `zdp-client-sdks`의 sdk surface/auth helper/upload client 계약과 checker skeleton을 repository validate gate로 검사한다.
- TypeScript, Dart, Rust SDK 표면, request_id 전파, 표준 에러 envelope, refresh token 저장 금지, 최종 권한 판단 금지, raw provider URL 공개 계약 금지 경계가 사라지면 실패하도록 했다.

## 0.34.0

- `ZDP-LIBS-001`을 추가해 `zdp-libs-ts`의 package/schema/env/event/error/i18n 계약과 checker skeleton을 repository validate gate로 검사한다.
- product domain model, secret/provider token, raw provider error, customer payload, translation runtime 경계가 공통 TypeScript 계약 패키지로 새면 실패하도록 했다.

## 0.33.0

- `ZDP-API-CONTRACTS-001`을 추가해 `zdp-api-contracts`의 route/error/webhook 계약과 checker skeleton을 repository validate gate로 검사한다.
- route 권한·감사·멱등성 hook, error envelope 추적·민감값 금지, webhook 서명·멱등성·재처리·dead-letter 기준이 사라지면 실패하도록 했다.

## 0.32.9

- `ZDP-MONEY-PLATFORM-001`이 `zdp-money-platform`의 payment webhook processing storage port skeleton까지 검사하도록 강화했다.
- `src/storage/payment_webhook_processing.rs`의 record/history/outbox persistence batch, compare-and-swap version protection, stale transition, mismatch, forbidden storage value 테스트 표면을 검증한다.

## 0.32.8

- `ZDP-MONEY-PLATFORM-001`이 `zdp-money-platform`의 payment webhook processing state/outbox skeleton까지 검사하도록 강화했다.
- `src/commands/payment_webhook_processing.rs`의 queued/processing/retry/succeeded/dead-letter 상태, duplicate provider event 처리, payload hash conflict, retry/dead-letter outbox record 테스트 표면을 검증한다.

## 0.32.7

- `ZDP-MONEY-PLATFORM-001`이 `zdp-money-platform`의 payment webhook-to-command handoff layer까지 검사하도록 강화했다.
- `src/commands/payment_webhook.rs`의 verified signature, provider event id idempotency, queue trace context, safe payload reference, ledger append bypass 방지 테스트 표면을 검증한다.

## 0.32.6

- `ZDP-MONEY-PLATFORM-001`이 `zdp-money-platform`의 command-to-ledger admission layer까지 검사하도록 강화했다.
- `src/commands/ledger.rs`의 envelope/draft mismatch, unsupported command type, forbidden payload reference, idempotency conflict 테스트 표면을 검증한다.

## 0.32.5

- `ZDP-MONEY-PLATFORM-001`이 `zdp-money-platform`의 순수 Rust ledger core까지 검사하도록 강화했다.
- `src/ledger/mod.rs`의 append-only transaction, double-entry rejection, idempotency decision, reversal entry, projection-not-truth, sensitive value rejection 테스트 표면을 검증한다.

## 0.32.4

- `ZDP-RUNTIME-001`이 runtime smoke target에 `money-api`를 요구하도록 강화했다.
- `money-api`의 `/healthz`, `/readyz`, contracts readiness, 결제·환불·크레딧 변경 없는 smoke 경계를 검증한다.

## 0.32.3

- `ZDP-MONEY-PLATFORM-001`이 `zdp-money-platform`의 최소 Rust/Axum API skeleton까지 검사하도록 강화했다.
- `Cargo.toml`, `Cargo.lock`, `/healthz`, `/readyz`, boundary marker, money command envelope source가 계속 유지되는지 검증한다.

## 0.32.2

- `ZDP-MONEY-PLATFORM-001`이 `contracts/ledger-storage.yaml`까지 검사하도록 강화했다.
- money ledger storage의 append-only row, double-entry balance, idempotency scope, rebuildable projection, forbidden storage pattern을 검증한다.
- money platform checker skeleton이 ledger storage 계약과 실패 테스트를 계속 포함하는지 검사한다.

## 0.32.1

- `ZDP-MONEY-PLATFORM-001`이 `zdp-money-platform`의 checker skeleton까지 검사하도록 강화했다.
- money platform package scripts와 `scripts/check-money-contracts.ts`, checker source, checker test 표면을 검증한다.

## 0.32.0

- `ZDP-MONEY-PLATFORM-001`을 추가했다.
- `zdp-money-platform` 저장소의 money boundary, command envelope, ledger entry, payment webhook, entitlement-credit 계약 파일을 검사한다.
- money platform이 제품 저장소 잔액 변경, 중복 웹훅 원장 반영, raw 결제 데이터 저장, billing의 credit balance truth 소유로 흐르지 않도록 검증한다.

## 0.31.0

- `ZDP-PRIVACY-001`을 추가했다.
- `zdp-privacy-access-broker` 저장소의 privacy access policy, capability grant, data minimization, access capability 계약 파일을 검사한다.
- privacy broker가 raw token, raw source payload, subject-level analytics stream, product authorization, entitlement, ledger decision을 소유하지 않도록 검증한다.

## 0.30.1

- `ZDP-GROWTH-001`이 `zdp-growth-lab`의 repo-local checker skeleton까지 검사하도록 강화했다.
- growth lab package scripts와 `scripts/check-growth-contracts.ts`, checker source, checker test 표면을 검증한다.

## 0.30.0

- `ZDP-GROWTH-001`을 추가했다.
- `zdp-growth-lab` 저장소의 funnel metric, growth experiment, experiment safety 계약 파일을 검사한다.
- growth lab이 CAC/LTV/CLV 정본, raw PII, 직접 DB 조회, money/core/privacy 최종 판단을 소유하지 않도록 검증한다.

## 0.29.5

- `ZDP-EDGE-001`이 edge analytics ingress의 data-platform runtime-compatible precheck 표면까지 검사하도록 강화했다.
- `/v1/events` source/test가 numeric `schema_version`과 `event_id`/`idempotency_key` consistency를 fail-closed로 유지하는지 검증한다.

## 0.29.4

- `ZDP-DATA-PLATFORM-001`이 `zdp-data-platform`의 validator-only analytics ingest runtime skeleton 표면까지 검사하도록 강화했다.
- data platform runtime source와 queue/event idempotency, sensitive field, architecture schema drift 실패 테스트 표면을 검증한다.

## 0.29.3

- `ZDP-DATA-PLATFORM-001`이 `zdp-data-platform`의 architecture-aware event schema compatibility checker 표면까지 검사하도록 강화했다.
- data platform checker의 `--architecture` 옵션, JSON Schema reader, event catalog/schema compatibility 검증, 관련 실패 테스트 표면을 검증한다.

## 0.29.2

- `ZDP-DATA-PLATFORM-001`이 `zdp-data-platform`의 analytics ingest checker skeleton까지 검사하도록 강화했다.
- data platform package scripts와 `scripts/check-data-contracts.ts`, checker source, checker test 표면을 검증한다.

## 0.29.1

- `ZDP-EDGE-001`이 `zdp-edge-workers`의 analytics ingress 계약까지 검사하도록 강화했다.
- edge가 analytics 이벤트를 `zdp-data-platform`으로 넘기되 ClickHouse 직접 쓰기나 최종 판단을 소유하지 않도록 검증한다.

## 0.29.0

- `ZDP-DATA-PLATFORM-001`을 추가했다.
- `zdp-data-platform` 저장소의 analytics ingest, ClickHouse storage, deletion/anonymization 계약 파일을 검사한다.
- GA4 대체 분석 기반이 직접 ClickHouse write, 최종 truth 소유, raw customer payload 저장으로 흐르지 않도록 검증한다.

## 0.28.1

- `ZDP-OBS-001`이 `zdp-platform-observability`의 checker skeleton까지 검사하도록 강화했다.
- observability package scripts와 `scripts/check-observability-contracts.ts`, checker source, checker test 표면을 검증한다.

## 0.28.0

- `ZDP-INFRA-001`을 추가했다.
- `zdp-platform-infra` 저장소의 resource inventory, environment schema, backup/restore 계약 파일을 검사한다.
- provider 연결 전 Cloudflare/Hetzner 리소스 인벤토리 자리, 환경별 접근 경계, restore drill evidence와 비밀값 금지 정책이 유지되는지 검증한다.

## 0.27.0

- `ZDP-OBS-001`을 추가했다.
- `zdp-platform-observability` 저장소의 telemetry convention, dashboard inventory, alert rule 계약 파일을 검사한다.
- request/trace 공통 식별자, 민감 속성 redaction, dashboard-only 변경 금지, 초기 alert rule 목록이 provider 연결 전 gate로 유지되는지 검증한다.

## 0.26.2

- `ZDP-RUNTIME-001`이 `zdp-platform-runtime`의 smoke runner skeleton까지 검사하도록 강화했다.
- runtime package scripts와 `scripts/smoke-runner.ts`, runner source, runner test 표면을 검증한다.

## 0.26.1

- `ZDP-RUNTIME-001`이 `edge-webhook-ingress` smoke target을 필수로 검사하도록 강화했다.
- `edge-webhook-ingress`의 `edge-worker` process, `/healthz`, `/readyz`, request/trace 전파 차단 조건을 검증한다.

## 0.26.0

- `ZDP-EDGE-001`을 추가했다.
- `zdp-edge-workers` 저장소의 request boundary, webhook ingress, queue envelope 계약 파일을 검사한다.
- edge가 request_id와 trace_id 전파, webhook 검증, queue envelope 경계를 유지하고 최종 권한·원장·개인정보 판단을 소유하지 않도록 검증한다.

## 0.25.0

- `ZDP-RUNTIME-001`을 추가했다.
- `zdp-platform-runtime` 저장소의 health/readiness, smoke target, deployment template, rollback 계약 파일을 검사한다.
- `core-api`, `app-console`의 초기 runtime smoke target이 production runtime template 전 기준으로 유지되는지 검증한다.

## 0.24.0

- `ZDP-APP-001`을 추가했다.
- `zdp-web-apps` 저장소의 app shell 계약 파일과 SvelteKit route skeleton을 검사한다.
- app shell 소스가 직접 DB 접근, refresh token 저장, UI 최종 권한 판단 같은 platform truth 소유 패턴을 포함하지 못하도록 차단한다.

## 0.23.2

- provider webhook, AI, money movement, 데이터 저장소, repository stage 검증에서 존재 여부만으로 보안 통제가 통과하던 경로를 차단했다.
- AI 서비스의 직접 데이터 저장소 접근 검증이 중앙 카탈로그의 검증되지 않은 `component` 값을 소유권 예외로 신뢰하지 않도록 강화했다.
- 데이터 저장소 `kind`와 repository `repo_stage`의 비정상 타입·비정규 값이 정책 검사를 우회하지 못하도록 실패 닫힘 검증을 추가했다.

## 0.23.1

- 결제 데이터, AI 데이터스토어, 공개 API, tier0 핵심 통제 검증의 정책 우회 경로를 차단했다.
- `doctor`의 Git 상태 확인이 저장소 로컬 helper 설정을 실행하지 않도록 Git 호출을 강화했다.
- `diff` 스냅샷 생성 시 Git tree 경로가 임시 디렉터리 밖으로 빠져나가지 못하도록 검증을 추가했다.

## 0.23.0

- `ZDP-WEBPUB-001`을 추가했다.
- 공개 정적 웹 저장소가 루트 `webpub.toml`을 갖는지 검사한다.
- `webpub.toml`의 후보 도메인 상태, 후보 도메인 목록, 공개 전 robots 차단 정책이 `service.yaml`과 어긋나지 않는지 검사한다.

## 0.22.0

- `ZDP-DOMAIN-001`을 추가했다.
- 후보 공개 도메인이 실제 공개 도메인이나 정본 도메인으로 선언되는 실수를 차단한다.
- `domain_status: live` 서비스 계약이 정본 도메인을 밝히는지 검사한다.

## 0.21.0

- `ZDP-REPO-MARKDOWN-002`를 추가했다.
- CLI, 패키지, SDK, 템플릿 성격의 실제 저장소가 루트 `CONTRIBUTING.md`와 `CHANGELOG.md`를 갖는지 검사한다.
- `zdp-architecture-linter` 루트에 기여 규칙과 변경 내역 문서를 추가했다.

## 0.20.0

- `ZDP-REPO-MARKDOWN-001`을 추가했다.
- 실험 저장소가 루트 `EXPERIMENT.md`를 갖는지 검사한다.

## 0.19.0

- `ZDP-REPO-BASELINE-001`을 추가했다.
- 실제 저장소 루트의 `.editorconfig`, `.gitattributes`, `AGENTS.md`, `README.md` 존재 여부를 검사한다.

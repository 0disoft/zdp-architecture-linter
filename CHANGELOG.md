# 변경 내역

## Unreleased

## 0.39.130

- architecture diff가 catalog ID의 앞뒤 공백을 canonical identity에서 제거해 같은 service/datastore를 added+removed로 오분류하지 않으면서, 원문 교정은 changed 항목으로 유지하도록 했다.

## 0.39.129

- Valkey·Redis 계열의 bounded runtime state를 카탈로그에서 숨기지 않도록 `key-value-store` datastore kind와 regression coverage를 추가했다.

## 0.39.128

- report-only `compliance` 명령을 추가해 `service.yaml` 선언, 정적 검증, 구현 증거, live 증거를 분리하고 근거 없는 구현·운영 완료 판정을 `unknown`으로 유지한다.
- compliance JSON schema `zdp.architecture.contract-compliance-report.v1`과 validation error를 숨기지 않는 exit code 계약을 추가한다.

## 0.39.127

- repository `service.yaml` graph가 canonical `service.repo`와 레거시 루트 `repo`를 동시에 ownership edge로 만들지 않고, canonical 필드가 없을 때만 레거시 값을 fallback으로 사용하도록 정리했다.

## 0.39.126

- `ZDP-PROVIDER-003`을 추가해 `psp` 또는 `psp-router` 외부 제공자 후보가 서명 검증, 재처리, provider event id 멱등성, 최신 공식 계약 증거를 요구하는 `webhook_intake` 정책을 잃으면 실패하도록 했다.
- `ZDP-PROVIDER-004`와 `schemas/external-provider.schema.json` preflight를 추가해 외부 제공자 카탈로그의 shape와 PSP 조건부 필수 필드를 fail-closed 검증한다.
- Windows에서 동일 generated output을 동시에 교체할 때 발생할 수 있는 일시적 `EPERM`/`EACCES`/`EBUSY` rename 경쟁만 제한적으로 재시도해 atomic write를 안정화했다.

## 0.39.125

- `ZDP-DATA-007`을 추가해 `catalogs/data-classes.yaml`이 `schemas/data-class.schema.json`을 통과하지 못하면 semantic validation과 graph 기반 명령으로 진행하지 않도록 fail-closed 처리했다.
- repository, data class, event catalog schema를 공통 preflight로 묶고 `graph`, `pack`, `list`, `normalize`가 schema-invalid catalog에서 산출물을 만들지 못하도록 회귀 테스트를 추가했다.

## 0.39.124

- `pack`과 `normalize` 생성 파일을 대상 디렉터리의 임시 파일에 완전히 기록하고 동기화한 뒤 최종 경로로 교체해, 쓰기 실패가 기존 정상 파일을 부분 산출물로 덮어쓰지 않도록 강화했다.
- 동일한 생성 경로에 동시 쓰기가 발생해도 최종 파일이 한 writer의 완전한 내용만 가지며 실패한 임시 파일이 정리되는 회귀 테스트를 추가했다.

## 0.39.123

- `ZDP-CORE-001`의 Rust CI 필수 계약을 `ZDP-AUTO-009`와 맞춰 checkout과 rust-toolchain Action을 full SHA로 고정하고 checkout credential persistence 및 명시적 stable toolchain 설정을 요구하도록 갱신했다.

## 0.39.122

- `ZDP-AUTO-009`를 추가해 모든 GitHub Actions workflow의 외부 Action/reusable workflow를 full commit SHA로 고정하고 모든 checkout에서 credential persistence를 끄도록 경고한다.
- linter 자체 CI와 write-capable labeler도 full SHA pin 및 non-persistent checkout 계약으로 강화했다.

## 0.39.121

- `ZDP-WEBPUB-001`이 public web CI의 모든 외부 Action을 full commit SHA로 고정하고 모든 checkout에서 credential persistence를 끄도록 강화했다.
- mutable Action ref와 checkout credential persistence를 차단하는 web-public 회귀 테스트를 추가했다.

## 0.39.120

- 제품 로컬 개인정보를 선언한 service contract가 삭제 증거, 관리자 열람 감사, privacy 사람 검토를 빠뜨리면 `ZDP-DATA-006`으로 차단한다.
- `ZDP-APP-001`이 app shell CI의 모든 외부 Action을 full commit SHA로 고정하고 모든 checkout에서 credential persistence를 끄도록 강화했다.
- mutable Action ref와 checkout credential persistence를 각각 차단하는 회귀 테스트를 추가했다.

## 0.39.119

- `ZDP-WEBPUB-001`이 공개 `zdp-design-system`을 sibling checkout/build하지 않고 npm registry package range, lock integrity, 설치 버전으로 검증하도록 CI 계약을 갱신했다.
- web-public CI에 design-system checkout 또는 `package:build`가 다시 들어오면 실패하는 회귀 테스트를 추가했다.

## 0.39.118

- 제품명 기반 bootstrap 저장소 `melamed`를 `product` area의 명시적 저장소 이름으로 검증하고 회귀 테스트를 추가했다.

## 0.39.117

- 제품명 기반 private vertical 저장소 `zdp-orchid-pass`를 `product` area의 명시적 저장소 이름으로 검증하고 회귀 테스트를 추가했다.

## 0.39.116

- 수동 실행 전용 데스크톱 셸 증거 워크플로에서 `pull_request_target`을 포함한 자동 트리거를 Tauri/Wails 모두 차단한다.

## 0.39.115

- `diff` snapshot 생성 경로의 Git 호출도 doctor 명령과 같은 hardened argv(`core.fsmonitor=false`, `core.hooksPath=`, `credential.helper=`)를 사용하도록 통일했다.

## 0.39.113

- `diff` 명령에서 head snapshot 생성이 실패해도 이미 만든 base snapshot 임시 디렉터리를 정리한다.
- `doctor` 명령의 Git 호출에 명시적인 buffer와 timeout을 적용해 큰 작업 트리에서 기본 buffer 한계로 실패하지 않게 한다.

## 0.39.112

- `ZDP-AUTO-008`을 추가해 `zdp-desktop-tauri`와 `zdp-desktop-wails`의 수동 desktop-shell evidence CI 계약을 검사한다.
- Tauri/Wails evidence workflow 이름, 짧은 보관 기간의 evidence artifact, Wails의 Tauri baseline checkout fallback, release/native activation으로 오해될 수 있는 트리거와 명령 drift를 경고한다.

## 0.39.111

- `ZDP-RUNTIME-001`이 `data-platform-contracts` one-shot contract check target을 요구한다.
- runtime smoke contract가 analytics ingest promotion 전에 `zdp-data-platform`의 data contract checker, operational metrics contract, runtime metric label drift 증거를 유지하는지 검사한다.

## 0.39.110

- `ZDP-DATA-PLATFORM-001`이 `zdp-data-platform`의 `contracts/operational-metrics.yaml` 존재와 Prometheus 운영 메트릭 계약을 중앙 linter에서도 검사한다.
- `service.yaml`의 `observability.operational_metrics`가 운영 메트릭 계약과 어긋나거나 repo-local checker가 운영 메트릭 drift 테스트/검증 표면을 잃으면 실패한다.

## 0.39.109

- `ZDP-REPO-REVIEW-001`을 추가해 `catalogs/repositories.yaml`의 `agent_review` 자동 리뷰 편입 계약을 검사한다.
- 정규화 registry repository node에 `agentReview`를 포함하고, `list repos`에 `--agent-review-status <status>` 필터와 `agentReviewStatus` 출력을 추가했다.

## 0.39.96

- `ZDP-AUTO-007`을 추가해 `automation.stale_bot.enabled`가 `true`인 deploy unit 저장소가 `bug`/`security` label을 exempt하지 않거나 보안 이슈 자동 종료를 허용하면 경고한다.

## 0.39.95

- `ZDP-AUTO-006`을 추가해 `automation.auto_merge.enabled`가 `true`인 deploy unit 저장소가 required checks, owner review, major update 금지선을 선언하지 않으면 경고한다.

## 0.39.94

- `ZDP-AUTO-005`를 추가해 issue form과 PR template이 비밀값, 결제 payload, 고객 원문 데이터 제출 금지를 안내하는지 경고한다.
- 실제 `.github/ISSUE_TEMPLATE`와 PR template 파일 본문, `service.yaml`의 `automation.templates` 경고 플래그와 `forbidden_submission_classes`를 함께 검사한다.

## 0.39.93

- `ZDP-AUTO-004`를 추가해 deploy unit 저장소에서 release helper가 켜졌거나 release helper config가 있는데 version source of truth와 changelog 정책이 빠진 경우 경고한다.
- `release-please-config.json`, `.release-please-manifest.json`, `.github/release-drafter.yml`/`.yaml`, release helper workflow 파일을 repo root 증거로 검사한다.

## 0.39.92

- `ZDP-AUTO-002`를 추가해 deploy unit 저장소에서 Renovate와 Dependabot이 동시에 dependency update owner가 되는 구성을 경고한다.
- `service.yaml`의 `automation.dependency_updates.renovate_enabled`와 `dependabot_enabled`가 둘 다 `true`인 경우, 또는 repository root에 Renovate config와 `.github/dependabot.yml`이 함께 있는 경우를 검사한다.

## 0.39.91

- `ZDP-XCUT-SECRET-001`을 추가해 repository root의 public discovery artifact(`llms.txt`, `sitemap.xml`, `robots.txt`, `.well-known`, discovery JSON)에 비밀값, 내부 URL, 비공개 경로가 들어가는지 검사한다.
- 공개 discovery 파일에 localhost/private-network/internal host URL, private/admin/internal/customer-data/ops/backoffice 경로, private key/API key/access token 형태 값, 채워진 secret assignment가 보이면 실패한다.

## 0.39.90

- `ZDP-TOKEN-008`을 추가해 `zdp-crypto-wallet`과 `zdp-token-operator`의 `contracts/custody-control-plane.yaml` wallet/custody 통제면 계약을 중앙 linter에서도 검사한다.
- self-custody, managed/custodial, sponsor wallet, treasury wallet, capability wallet 분리, signer owner/recovery/withdrawal approval/signer rotation/custody reconciliation/audit/capability scope 필수 통제, money/core/indexer/CI signer 금지, raw private key 저장 금지를 검사한다.

## 0.39.89

- `ZDP-TOKEN-007`을 추가해 `zdp-token-protocol`의 `contracts/package-publication-record.yaml`와 `contracts/active-deployment-manifest.yaml` 분리 계약을 중앙 linter에서도 검사한다.
- Move package publication fact와 active ZDP deployment manifest 분리, publication이 active deployment를 암시하는 구조 금지, runtime credential 포함 금지, product repository env var로 package ID를 복붙 허용하는 계약 금지를 검사한다.

## 0.39.88

- `ZDP-TOKEN-006`을 추가해 `zdp-token-protocol`의 `contracts/token-identity.yaml` Token Identity Contract를 중앙 linter에서도 검사한다.
- `ZDP_ENTITLEMENT`와 `ZDP_CREDIT`의 정본 분리, settlement/governance 초기 금지, money ledger chain-state 대체 금지, membership cash-equivalent 표현 금지, credit/settlement/governance 권리의 merged balance 금지를 검사한다.

## 0.39.87

- `ZDP-TOKEN-005`를 추가해 `zdp-token-protocol`의 `contracts/package-upgrade-policy.yaml` package upgrade 계약을 중앙 linter에서도 검사한다.
- original/latest package id, dependency/build digest manifest, old-version guard, migration plan, `PackageUpgraded`/`StateMigrated`/`OperationallyEnabled` event 분리, publish와 operational enablement 분리, pause/unpause approval split, rollback-forward-only 정책이 사라지면 실패한다.

## 0.39.86

- `ZDP-TOKEN-004`를 추가해 money/core/product 서비스가 raw chain event 또는 token indexer datastore를 직접 ledger, entitlement, customer-right command로 소비하지 못하게 검사한다.
- `onchain_events_store` 또는 `zdp-token-indexer` 소유 datastore를 소비하는 대상 서비스는 reconciliation policy, idempotency policy, package version allowlist를 선언해야 하며 raw chain event direct command 플래그는 실패한다.

## 0.39.85

- `ZDP-TOKEN-003`을 추가해 `zdp-token-protocol`과 `zdp-token-indexer`의 `contracts/sui-api-selection.yaml` Sui API 선택 계약을 중앙 linter에서도 검사한다.
- 신규 token 통합이 JSON-RPC를 baseline으로 삼거나, gRPC/GraphQL/Core API/archival provider 검토, 최신 공식 문서·migration guide review requirement, 단일 endpoint config owner를 잃으면 실패한다.

## 0.39.84

- `ZDP-TOKEN-002`를 추가해 `zdp-token-indexer`의 `contracts/chain-fact-contract.yaml` chain fact 정규화 계약을 중앙 linter에서도 검사한다.
- token indexer가 checkpoint/effects/object-change/Move event/BCS payload source, 필수 chain fact 필드, observed/quarantined event, replay/quarantine 요구사항, money consumption gate를 잃거나 signing/custody/ledger posting/mint-burn correction/customer-right 정본 역할을 맡으면 실패한다.

## 0.39.83

- `ZDP-TOKEN-001`을 추가해 `zdp-token-protocol`의 `contracts/token-authority-matrix.yaml` 권한/capability matrix 계약을 중앙 linter에서도 검사한다.
- token authority matrix가 lab-only 상태, Supply/Upgrade/Compliance/Emergency authority 분리, 무제한 `AdminCap` 금지, single hot wallet 금지, self-custody 기본값, managed custody 별도 gate를 잃으면 실패한다.

## 0.39.82

- `ZDP-APP-001`이 `zdp-web-apps` auth route promotion 계약에서 `contracts/auth-product-review-approval.yaml` receipt review, `typed_product_approval_gate_receipt_no_route_unblock`, `no_product_reviewer_approval`, `product_reviewer_approval_present`, `product_approval_evidence_ref_present` 조건을 요구하도록 강화했다.
- auth route alias 차단 메시지도 product approval receipt review 없이는 route unblock이 불가능하다는 기준으로 동기화했다.

## 0.39.72

- `ZDP-LOCALIZATION-001`이 `@zdp/localization-content` 내부 package boundary도 필수 package set으로 검사하도록 동기화했다.

## 0.39.71

- `ZDP-APP-001`과 `ZDP-WEBPUB-001`의 GitHub Actions checkout action 계약을 `actions/checkout@v7`로 동기화했다.
- 공개된 `zdp-design-system` sibling checkout 문구를 private-only 표현에서 public/private token boundary 표현으로 정리했다.

## 0.39.69

- `ZDP-MONEY-004`가 payment outbox의 `outbox_id`와 `cloud_event_id` 분리, `cloud_event_type`, aggregate/cloud-event-type/idempotency scope를 검사하도록 맞췄다.

## 0.39.68

- `ZDP-MONEY-004`가 payment outbox claim lock 계약도 검사하도록 강화했다.
- payment outbox의 `claimed_by`, `claim_token`, `claim_expires_at`, `row_version`, claim token/lease, claim token uniqueness, row-version compare-and-swap 기준이 사라지면 실패한다.
- `zdp-money-platform`의 payment outbox delivery command/storage skeleton과 repo-local checker source proof를 중앙 linter fixture와 동기화했다.

## 0.39.67

- `ZDP-MONEY-004`를 추가해 `zdp-money-platform`의 `contracts/money-db-schema.yaml` payment webhook processing/outbox 계약을 중앙 linter에서도 검사한다.
- README의 구현 순서 상태 라벨을 현재 CLI와 rule coverage 기준으로 정리했다.

## 0.39.66

- 공개 visibility 전환 경계를 README와 SECURITY에 명시하고, 실제 토큰 형식처럼 보이는 infra 테스트 fixture 값을 명시적 가짜 값으로 바꿨다.

## 0.39.65

- source proof 검사에서 정규식 literal 안의 가짜 code fragment를 코드 증거로 인정하지 않도록 보강했다.

## 0.39.64

- `ZDP-CLIENT-SDKS-001`의 SDK generation 금지 ownership/value와 contract status allowlist를 repo-local client SDK checker 기준으로 동기화했다.
- `ZDP-CONNECTORS-001`이 sync-state/provider-boundary의 `provider_api_key_plaintext` 금지값을 중앙 linter에서도 요구하도록 맞췄다.
- connectors checker source proof가 문자열 literal stub이나 placeholder test로 통과하지 않도록 함수 code fragment와 실제 test case name 검사를 추가했다.

## 0.39.63

- `ZDP-API-CONTRACTS-001`과 `ZDP-AUTH-ROUTE-001`을 최신 API 계약의 forbidden value, SDK source contract, auth/session catalog status 기준으로 동기화했다.
- API checker source proof가 auth/session schema bundle source와 SDK source-contract/schema-bundle diagnostic도 유지하는지 검사하도록 보강했다.

## 0.39.62

- `ZDP-CORE-001`이 identity session store의 migration-shape status와 command/idempotency/audit 필드 drift를 최신 core 계약 기준으로 검사하도록 동기화했다.
- `ZDP-CORE-001`에 `core-event-outbox.yaml` 필수 파일과 event/field/control/forbidden claim 검증을 추가했다.
- `ZDP-RUNTIME-001`이 `core-api` smoke target의 healthz service id와 DB readiness production blocker도 검사하도록 강화했다.

## 0.39.61

- `ZDP-MONEY-PLATFORM-001`의 money ledger 금액 필드와 integer unit 검증을 `amount_credit_unit` / `integer_credit_units_required` 계약으로 동기화했다.
- money command type allowlist를 최신 money platform command envelope와 맞추고, 중앙 linter 테스트 fixture를 credit-unit 계약 기준으로 갱신했다.

## 0.39.60

- `ZDP-CREDENTIAL-001`이 credential-vault capability renewal/load shedding 계약과 positive integer TTL drift를 중앙 linter에서도 검사하도록 강화했다.
- credential-vault Rust boundary marker를 raw source fragment가 아니라 YAML 계약과 semantic set/TTL 비교로 검증하도록 보강했다.
- credential-vault checker source proof가 diagnostic code 문자열 배열만으로 통과하지 않도록 함수 body 단위 검증을 추가했다.

## 0.39.59

- `ZDP-PRIVACY-001`이 privacy-access-broker의 `allowed_callers`, `break_glass.allowed`, AI/connector purpose limit, retention, policy input logging, implementation guard 계약을 중앙 linter에서도 검사하도록 강화했다.
- privacy access broker checker source proof가 새 parser/type/validator/test 표면을 요구하도록 보강해 repo-local checker와 중앙 gate drift를 줄였다.

## 0.39.58

- `ZDP-CREDENTIAL-001`이 credential-vault checker source proof에서 positive safe integer TTL 검증 함수와 diagnostic code, 회귀 테스트 이름까지 요구하도록 강화했다.

## 0.39.57

- `ZDP-RUNTIME-001`이 smoke target metadata, generic smoke target schema, deployment worker optional 정책, rollback blocker, smoke runner script command를 중앙 linter에서도 검사하도록 강화했다.
- runtime smoke runner source proof와 fixture를 healthcheck/deployment/rollback 전체 계약 파서 기준으로 맞췄다.

## 0.39.56

- `ZDP-INFRA-001`이 pricing review date/max-age, forbidden source value, restore drill status/target을 중앙 linter에서도 검사하도록 강화했다.
- infra restore drill id 하드코딩을 제거하고 모든 restore drill의 required evidence를 검사하도록 repo-local checker와 맞췄다.
- `zdp-platform-infra` checker source proof가 문자열 literal stub이나 placeholder test로 통과하지 않도록 code fragment와 실제 test case name 검사를 추가했다.
- infra package `check` script가 typecheck, test, contract check, infra plan을 함께 실행하는지 검사한다.

## 0.39.55

- `ZDP-SECURITY-001`이 threat model, secret handling, dependency review 계약의 `contract.owner`를 중앙 linter에서도 검사하도록 강화했다.
- dependency review의 `maintainer_risk_levels`와 `critical_path_policy.require_version_pin_reason`을 repo-local checker와 같은 기준으로 검증하도록 맞췄다.
- `zdp-platform-security` repo-local checker source proof와 중앙 security rule 테스트가 새 dependency/owner drift 회귀 케이스를 요구하도록 보강했다.

## 0.39.54

- `ZDP-PRIVACY-001`이 privacy-access-broker `allowed_operations`, `allowed_output_shapes`, `purpose_limits.growth_or_analytics.allowed_shapes`에 승인되지 않은 항목이나 중복 항목이 섞이면 실패하도록 강화했다.
- privacy access broker 중앙 linter gate를 repo-local contract checker의 exact allowed-surface 정책과 맞췄다.

## 0.39.53

- `ZDP-CREDENTIAL-001`이 credential-vault `allowed_operations`와 `allowed_interfaces`에 승인되지 않은 항목이나 중복 항목이 섞이면 실패하도록 강화했다.
- credential vault 중앙 linter gate를 repo-local contract checker의 exact allowed-surface 정책과 맞췄다.

## 0.39.52

- `ZDP-CONNECTORS-001`이 provider registry의 credential capability, privacy scope, sync-state policy, webhook replay policy를 검사하도록 강화했다.
- connectors sync-state, webhook replay, provider-boundary 필수 필드와 금지값을 repo-local Rust boundary marker와 맞췄다.
- connectors contract fixture와 source proof를 새 provider/sync/webhook 경계 필드 기준으로 동기화했다.
- `ZDP-SECURITY-001` source proof가 threat-model review status, secret logging evidence, promotion blocker 타입/파서 표면 누락도 잡도록 강화했다.

## 0.39.51

- `ZDP-PRIVACY-001`이 privacy-access-broker package `check` script가 TypeScript, Bun tests, contract checker, Rust fmt/check/test를 함께 실행하는지 검사한다.
- privacy-access-broker checker source proof가 문자열 literal stub이나 placeholder test로 통과하지 않도록 code fragment와 실제 test case name 검사를 추가했다.
- privacy access broker contract 문자열 목록에 비문자 항목이 섞이면 실패하도록 강화했다.

## 0.39.50

- `ZDP-CREDENTIAL-001`이 credential-vault package `check` script가 TypeScript, Bun tests, contract checker, Rust fmt/check/test를 함께 실행하는지 검사한다.
- credential-vault checker source proof가 문자열 literal stub이나 placeholder test로 통과하지 않도록 code fragment와 실제 test case name 검사를 추가했다.
- credential vault contract 문자열 목록에 비문자 항목이 섞이면 실패하도록 강화했다.

## 0.39.49

- `ZDP-DATA-PLATFORM-001`이 data-platform package `check` script가 typecheck, test, contract check, architecture compatibility check를 함께 실행하는지 검사한다.
- `zdp-data-platform` repo-local checker source proof가 문자열 literal stub이나 placeholder test로 통과하지 않도록 code fragment와 실제 test case name 검사를 추가했다.
- data-platform contract 문자열 목록에 비문자 항목이 섞이면 실패하도록 강화했다.

## 0.39.48

- `ZDP-OBS-001`이 deploy/job/webhook telemetry attribute, dashboard required panel, alert field/severity/signal 형식까지 검사하도록 강화했다.
- `zdp-platform-observability` repo-local checker source proof가 문자열 literal stub이나 placeholder test로 통과하지 않도록 code fragment와 실제 test case name 검사를 추가했다.
- observability package `check` script가 typecheck, test, contract check를 함께 실행하는지 검사한다.

## 0.39.47

- `ZDP-INFRA-001`이 provider 연결 전 `contracts/dns-records.yaml`의 `records`와 `contracts/firewall-rules.yaml`의 `rules`가 비어 있는지 검사하도록 강화했다.
- `zdp-platform-infra` repo-local checker source proof가 DNS/firewall entry 금지 회귀 테스트 fragment를 포함해야 통과하도록 맞췄다.

## 0.39.46

- `ZDP-INFRA-001`이 `contracts/dns-records.yaml`과 `contracts/firewall-rules.yaml`을 직접 읽어 provider mutation, secret value, live DNS record/server IP 허용 drift를 검사하도록 강화했다.
- `zdp-platform-infra` repo-local checker source proof가 pricing review required, DNS provider mutation, firewall live IP 회귀 테스트 fragment를 포함해야 통과하도록 맞췄다.

## 0.39.45

- `ZDP-SECURITY-001`이 threat model template의 `template.review_statuses`에 `draft`, `reviewed`, `blocked`, `accepted_risk`가 유지되는지 검사하도록 강화했다.
- secret handling contract의 `logging.allowed_evidence`와 `promotion_blocking` 필수 항목을 중앙 linter에서도 검사해 repo-local checker와 검증 강도를 맞췄다.
- `zdp-platform-security` repo-local checker source proof가 review status, logging evidence, secret promotion blocker 회귀 테스트 fragment를 포함해야 통과하도록 강화했다.

## 0.39.44

- `ZDP-RUNTIME-001`이 runtime smoke target과 one-shot contract check target의 `required_before` gate를 검사하도록 강화했다.
- runtime smoke target의 `required_before`, readiness check, required file/evidence 같은 필수 문자열 배열에 비문자 항목이 섞이면 실패하도록 강화했다.
- `blocked_production_when`이 구조화 객체와 legacy 문자열 항목을 섞어도 실패하도록 malformed item 진단을 추가했다.
- `ZDP-CLIENT-SDKS-001`이 client SDK package `check` script가 typecheck, test, contract check, generation plan check를 함께 실행하는지 검사한다.
- runtime smoke runner와 client SDK checker의 source proof가 문자열 리터럴 stub이나 placeholder test로 통과하지 않도록 code fragment와 `test()`/`it()` 실제 test case name 검사를 추가했다.
- runtime smoke contract의 `contract_checks` 배열 누락 진단이 중복으로 쏟아지지 않게 정리하고, client SDK service contract와 contract YAML의 필수 문자열 배열이 비문자열 항목을 포함하면 실패하도록 강화했다.

## 0.39.43

- `ZDP-RUNTIME-001`이 `zdp-platform-runtime`의 `blocked_production_when`을 문자열 목록이 아니라 `{ condition, enforced_by }` 객체 목록으로 검사하도록 강화했다.
- runtime smoke target과 one-shot contract check target의 enforcement owner가 `smoke_runner`, `architecture_linter`, `owning_contract_checker`, `operator_review` 중 하나로 유지되는지 검사한다.
- runtime package `check` script가 `tsc --noEmit`과 `bun test`를 함께 실행하는지 검사한다.

## 0.39.42

- `ZDP-CLIENT-SDKS-001`이 `zdp-client-sdks`의 auth/session route metadata, forbidden values, SDK surface cross-language rules를 검사하도록 강화했다.
- SDK surface와 upload client가 `trace_id`와 idempotency key propagation을 잃거나, auth helper가 session token/raw credential storage 금지 경계를 잃으면 실패한다.
- client SDK generation plan이 API input forbidden values를 양방향 drift로 검증하는 표면도 유지하도록 검사한다.

## 0.39.41

- `ZDP-CORE-001`이 `zdp-core-platform` auth durable storage transaction/outbox 계약을 검사하도록 강화했다.
- transaction/outbox boundary가 transaction/outbox/commit/rollback/replay/review ref, migration readiness source, atomic state+outbox control, external-effect-after-commit control을 잃으면 실패한다.
- transaction/outbox boundary를 DB transaction manager, outbox dispatcher, durable adapter, live handler, provider token exchange, product route unblock 증거로 오해하는 claim도 실패한다.

## 0.39.40

- `ZDP-CORE-001`이 `zdp-core-platform` auth durable storage migration readiness 계약을 검사하도록 강화했다.
- migration readiness가 storage/schema/migration/schema-owner/review/transaction/rollback ref, admission source, auth storage target, seed/backfill과 rollback control을 잃으면 실패한다.
- migration readiness boundary를 DB migration applied, durable adapter ready, live handler, provider token exchange, product route unblock 증거로 오해하는 claim도 실패한다.

## 0.39.39

- `ZDP-CHATGPT-APP-001`을 추가해 `zdp-ai-chatgpt-gateway`, `chatgpt-mcp-gateway`, OpenAI provider의 ChatGPT Apps SDK/MCP 경계를 검사한다.
- ChatGPT 앱 게이트웨이가 새 저장소로 너무 빨리 승격되거나, 직접 datastore 접근·안전 dependency 누락·OpenAI host 역할 누락이 생기면 실패한다.
- structuredContent/content/_meta/widget state secret 금지, privacy broker·credential vault·audit·idempotency 선행 조건, 구현 전 OpenAI 공식 문서 재확인 문구가 사라지는 drift도 실패한다.

## 0.39.38

- `ZDP-CORE-001`이 `zdp-core-platform` auth durable storage admission 계약을 검사하도록 강화했다.
- durable storage admission이 migration/review/transaction/rollback ref, request/trace/idempotency/resource/audit metadata, auth storage target을 잃으면 실패한다.
- storage admission boundary를 DB migration, durable adapter, live handler, provider token exchange, product route unblock 증거로 오해하는 claim도 실패한다.

## 0.39.37

- `ZDP-CORE-001`이 `zdp-core-platform` auth runtime command propagation 계약을 검사하도록 강화했다.
- command propagation이 admitted request/trace/idempotency/resource/audit metadata를 session, passkey, OAuth, audit, idempotency target으로 보존하는지 검사한다.
- propagation boundary를 live handler, durable request propagation, durable storage, provider token exchange, product route unblock 증거로 오해하는 claim도 실패한다.

## 0.39.36

- `ZDP-CORE-001`이 `zdp-core-platform` auth runtime admission context 계약을 검사하도록 강화했다.
- admission context가 `contract_only_no_live_handler`, `typed_admission_boundary_no_live_handler`, request/trace/idempotency/resource/audit ref 필수 gate를 잃으면 실패한다.
- admission boundary를 live handler, durable storage, provider token exchange, product route unblock 증거로 오해하는 claim도 실패한다.

## 0.39.35

- `ZDP-CORE-001`이 `zdp-core-platform` auth runtime readiness summary 계약을 검사하도록 강화했다.
- readiness summary가 `promotion_ready: false`, `production_route_ready: false`, durable implementation missing blocker, product reviewer approval blocker를 잃으면 실패한다.
- typed boundary를 production-ready, live handler, durable storage, OAuth provider exchange, product route unblock 증거로 오해하는 claim도 실패한다.

## 0.39.34

- `ZDP-CORE-001`이 `zdp-core-platform` auth OAuth callback state verification 계약을 검사하도록 강화했다.
- OAuth callback state 계약이 hash-only callback state/nonce, PKCE/redirect reference, provider scope, single-use consume, TTL, audit event reference, raw OAuth provider payload 금지 기준을 잃으면 실패한다.
- OAuth callback state adapter boundary가 `typed_adapter_boundary_no_migration`, state id/hash uniqueness, state version, atomic single-use consume, active-state consume, TTL, audit event reference, raw OAuth payload 금지 기준을 잃으면 실패한다.

## 0.39.33

- `ZDP-CORE-001`이 `zdp-core-platform` auth passkey challenge store 계약의 typed adapter boundary를 검사하도록 강화했다.
- passkey challenge adapter boundary가 `typed_adapter_boundary_no_migration`, challenge id/hash uniqueness, challenge version, atomic single-use consume, active-state consume, TTL, audit event reference, raw WebAuthn payload 금지 기준을 잃으면 실패한다.

## 0.39.32

- `ZDP-CORE-001`이 `zdp-core-platform` auth credential vault handoff 계약의 typed capability client boundary를 검사하도록 강화했다.
- capability client boundary가 live vault client로 승격되지 않은 상태, capability ref/metadata-only 응답, request/trace/idempotency/audit/vault-access-audit ref, raw secret/provider payload 금지 기준을 잃으면 실패한다.

## 0.39.31

- `ZDP-CORE-001`이 `zdp-core-platform` identity session store 계약의 `typed_adapter_boundary_no_migration` adapter boundary를 검사하도록 강화했다.
- session store adapter boundary가 transactional session store/session state table kind, transaction/issue/refresh/revoke/reuse/review refs, refresh rotation atomicity, reuse-family block, TTL, revocation state, plaintext refresh token 금지 기준을 잃으면 실패한다.

## 0.39.30

- `ZDP-CORE-001`이 `zdp-core-platform` auth idempotency storage 계약의 audit event ref와 typed adapter boundary를 검사하도록 강화했다.
- idempotency adapter boundary가 `typed_adapter_boundary_no_migration`, atomic unique claim table/transactional idempotency record kind, transaction/claim/replay/conflict/review refs, atomic claim/conflict, TTL, raw payload 금지, audit event reference 기준을 잃으면 실패한다.

## 0.39.29

- `ZDP-APP-001`이 `zdp-web-apps`의 source route tree에서 `/auth`, `/sign-in`, `/oauth/callback` 같은 auth route alias가 promotion 전에 생기면 실패하도록 강화했다.
- repo-local `check-app-shell`과 중앙 architecture validation이 같은 auth route 차단 경계를 보도록 맞췄다.

## 0.39.28

- `ZDP-APP-001`이 `zdp-web-apps`의 auth route promotion 계약에서 core auth/session promotion blocker 해소 조건을 요구하도록 강화했다.
- route catalog adoption과 live runtime handoff가 있어도 core promotion blocker가 남아 있으면 login/signup/recovery/passkey/provider-choice route는 계속 차단 상태여야 한다.

## 0.39.27

- `ZDP-CORE-001`이 `zdp-core-platform`의 `contracts/auth-passkey-challenge-store.yaml`을 검사하도록 강화했다.
- passkey challenge storage가 hash-only, single-use, TTL, request/trace/idempotency/audit reference, consume/expire metadata, raw WebAuthn payload 저장 금지 기준을 잃으면 실패한다.
- `contracts/auth-session-runtime.yaml`의 `no_passkey_challenge_store_implementation` promotion blocker도 유지해야 한다.

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

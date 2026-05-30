# 변경 내역

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

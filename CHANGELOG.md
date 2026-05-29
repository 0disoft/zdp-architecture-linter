# 변경 내역

## 0.25.0

- `ZDP-RUNTIME-001`을 추가했다.
- `zdp-platform-runtime` 저장소의 health/readiness, smoke target, deployment template, rollback 계약 파일을 검사한다.
- `core-api`와 `app-console`의 초기 runtime smoke target이 production runtime template 전 기준으로 유지되는지 검증한다.

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

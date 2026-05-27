# 변경 내역

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

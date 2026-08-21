# Self-contained Architecture Fixture

이 디렉터리는 GitHub Actions와 로컬 개발자가 sibling `zdp-architecture` checkout 없이 `zdp-arch validate`의 repository 통합 경로를 실행하기 위한 최소 fixture다.

## 증명하는 것

`bun run validate:self-contained`는 이 fixture를 architecture root로, 저장소 루트를 repository root로 사용한다. 이 경로는 loader 필수 파일, JSON Schema compile, catalog graph, `service.yaml` 참조, repository baseline 파일, root Markdown, automation 검사를 함께 실행한다.

## 증명하지 않는 것

이 fixture는 ZDP 정책 원천도, canonical architecture snapshot도 아니다. schema는 wiring 검증을 위해 의도적으로 permissive하고 정책 rule catalog는 비어 있다. 중앙 정책 통과 여부는 `zdp_architecture_validate_architecture_linter_repository`와 `zdp_architecture_validate_fast`로 확인한다.

## 변경 규칙

loader가 새 필수 입력을 요구하거나 이 저장소의 repository/service identity가 바뀔 때만 최소 범위로 수정한다. 중앙 catalog 전체, 운영자산, provider 상태, 제품 정책을 이 디렉터리에 복사하지 않는다.

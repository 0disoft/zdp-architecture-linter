# Checklist Router

Status: Active

이 파일은 `zdp-architecture-linter` 변경의 체크리스트 라우터다. 한 파일에 모든 점검을 쌓지 말고 변경 유형에 맞는 세부 체크리스트를 먼저 읽는다.

## 변경 유형별 라우팅

- 새 CLI 명령, 옵션, JSON 출력, exit code 변경: `.agents/checklists/cli-tool.md`
- 새 ZDP 규칙, 진단 ID, 실패 조건, warning/error 분류 변경: `.agents/checklists/architecture-rule.md`
- `zdp-architecture` 원천, fixture, schema, catalog, generated registry와 동기화되는 변경: `.agents/checklists/fixture-and-contract.md`
- 보안, 개인정보, credential, money, AI 사용자 데이터 경계 변경: `.agents/checklists/security.md`
- 성능, catalog reload, Ajv validator, graph/report hot path 변경: `.agents/checklists/performance.md`
- CI, release, rollback, package metadata, repository automation 변경: `.agents/checklists/ops-change.md`
- 의존성, Bun/TypeScript/Ajv/YAML 버전 변경: `.agents/checklists/dependency.md`

## 공통 차단 조건

- `zdp-architecture`의 문서, schema, catalog, rule, fixture 중 추적 가능한 원천 없이 새 정책을 만든다.
- 저장소 목록, 서비스 ID, data class, provider ID를 코드에 직접 하드코딩한다.
- 실패해야 하는 보안, money, privacy, credential, AI data 경계를 warning으로 낮춘다.
- CLI JSON 출력에 secret, 고객 payload, private incident evidence, raw provider payload를 담는다.
- fixture expectation을 완화해서 기존 버그를 통과시키고, 실패 조건을 좁히지 않는다.
- README, CHANGELOG, docs, tests, command intent 설명이 서로 다른 검증 계약을 말한다.

## 최종 보고에 포함할 것

- 바뀐 규칙 ID, CLI 명령, JSON 필드, fixture, source-of-truth 파일
- 실행한 mustflow intent 이름과 결과
- 실행하지 못한 검증과 이유
- `zdp-architecture` 쪽 동기화 필요 여부
- 남은 drift risk

# Agent Workspace

Status: Active

이 디렉터리는 `zdp-architecture-linter` 작업자가 빠르게 올바른 문맥으로 들어가기 위한 agent-facing 문서만 둔다. 정책 원천은 여기 있지 않다. 정책 원천은 `zdp-architecture`의 문서, schema, catalog, rule, fixture다.

## 읽는 순서

1. `AGENTS.md`
2. `README.md`
3. `CHECKLIST.md`
4. `VALIDATION.md`
5. `.agents/context-map.md`
6. 변경 유형에 맞는 `.agents/skills/*/SKILL.md`
7. 변경 유형에 맞는 `.agents/checklists/*.md`
8. 관련 source, tests, `zdp-architecture` 원천 파일

## 금지

- 이 디렉터리를 정책 원천처럼 인용하지 않는다.
- package script를 mustflow intent 없이 에이전트 실행 권한으로 취급하지 않는다.
- chain-of-thought, raw review log, secret, private incident detail을 저장하지 않는다.

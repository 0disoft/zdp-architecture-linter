# Architecture Rule Checklist

Status: Active

## Failure modes

- 원천 문서 없이 linter가 새 ZDP 정책을 만든다.
- 새 규칙이 실제 저장소 ID나 서비스 목록을 코드에 박아 넣는다.
- 보안, privacy, credential, money, AI data 경계를 경고로 낮춘다.
- 진단 메시지가 어떤 파일과 필드를 고칠지 말하지 않는다.
- fail fixture만 추가하고 pass fixture 또는 실제 저장소 검증 경계를 확인하지 않는다.

## Checklist

- 원천 파일을 확인했다: `zdp-architecture` docs, schema, catalog, rule, fixture 중 하나.
- 규칙 ID, severity, 실패 조건, 예외 조건, 고칠 필드가 명확하다.
- catalog에서 읽을 수 있는 값은 코드 상수 목록으로 중복하지 않았다.
- 새 rule은 기존 책임 모듈에 들어가거나, 새 module boundary가 작고 이름이 분명하다.
- 실패 fixture와 통과 fixture 또는 동등한 unit test가 있다.
- README 또는 CHANGELOG에 public rule behavior가 필요한 만큼 반영됐다.
- 실제 대상 repository validation intent가 있으면 실행하거나 skipped reason을 남겼다.

## Validation

- 기본: `zdp_architecture_linter_typecheck`
- 새 rule 또는 fixture: `zdp_architecture_linter_full_test`
- 특정 영역 rule: `VALIDATION.md`의 focused rules test intent
- central policy drift: `zdp_architecture_validate_fast`

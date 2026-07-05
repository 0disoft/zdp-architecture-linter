# Fixture And Contract Checklist

Status: Active

## Failure modes

- fixture expectation이 실제 rule behavior와 반대로 남는다.
- `service.yaml` schema fixture와 repository-service semantic fixture가 섞인다.
- generated registry를 source처럼 수동 편집한다.
- source proof가 문서 줄, schema id, catalog id, rule id 없이 뭉뚱그려진다.

## Checklist

- fixture 종류를 먼저 골랐다: `fixtures/pass`, `fixtures/fail`, `fixtures/service-schema/*`, `fixtures/repository-service/*`.
- 실패 fixture는 기대하는 rule ID와 실제 failure path를 검증한다.
- pass fixture는 같은 rule이 정상 예외를 막지 않는지 보여준다.
- schema `$id`, `schema_ref`, catalog id, service id, repo id가 현재 원천과 일치한다.
- generated output은 generator/check intent로 확인하고 수동 원천으로 쓰지 않는다.
- 변경한 fixture를 읽는 test가 정확히 실패/통과 조건을 검증한다.

## Validation

- fixture/rule change: `zdp_architecture_linter_full_test`
- registry output: `zdp_architecture_registry_check`
- architecture source consistency: `zdp_architecture_validate_fast`

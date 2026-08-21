# Performance Checklist

Status: Active

## Failure modes

- architecture catalogs를 같은 CLI run 안에서 반복 로드한다.
- Ajv validator를 validation target마다 새로 만들고 cache 경계를 설명하지 않는다.
- 독립 validator를 직렬 실행하거나, 병렬화하면서 완료 시점에 따라 진단·오류 순서가 달라진다.
- graph, normalize, diff, doctor 명령이 큰 작업 트리에서 buffer, timeout, cleanup 경계를 잃는다.
- JSON report가 필요 이상으로 source content를 포함해 자동화 payload를 키운다.

## Checklist

- hot path가 catalog load, schema compile, rule evaluation, graph/report generation 중 어디인지 밝혔다.
- cache를 추가하면 source root, schema set, rule set이 바뀔 때 stale result가 생기지 않는다.
- 같은 schema source의 concurrent compile을 하나의 in-flight 작업으로 합친다.
- 병렬화는 진단 순서 안정성과 canonical error aggregation 계약을 깨지 않는다.
- 전체 `validateArchitecture` warm p95를 하위 단계와 별도로 측정한다.
- 회귀율은 같은 Bun version, OS, CPU architecture에서 생성한 baseline과 비교한다.
- 큰 repo, 많은 fixture, dirty worktree에서 timeout/buffer/cleanup 경계를 고려했다.
- 성능 개선이 rule coverage나 진단 정확도를 낮추지 않는다.

## Validation

- 기본: `zdp_architecture_linter_typecheck`
- behavior 영향: `zdp_architecture_linter_full_test`
- scheduler/cache/budget 영향: `zdp_architecture_linter_performance_regression_test`
- CLI report 영향: 관련 `tests/architecture-*-report.test.ts`를 포함하는 full test

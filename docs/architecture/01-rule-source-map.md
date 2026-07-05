# Rule Source Map

Status: Active

## Purpose

Every blocking rule must trace to a durable source. The source can be a document, schema, catalog, rule file, fixture, or existing repository contract in `zdp-architecture`.

## Source classes

| Source class | Examples | Use for |
| --- | --- | --- |
| Documentation | `docs/24-service-contract.md`, `docs/30-platform-registry-cli.md` | policy intent, lifecycle boundary, operator-facing meaning |
| JSON Schema | `schemas/service.schema.json`, `schemas/event.schema.json`, `schemas/events/*.json` | machine shape, required fields, enum values |
| Catalog | `catalogs/repositories.yaml`, `catalogs/services.yaml`, `catalogs/datastores.yaml`, `catalogs/events.yaml` | IDs, ownership, references, graph edges |
| Rule YAML | `rules/*.yaml` | explicit rule metadata and policy gates |
| Fixture | `fixtures/**`, `fixtures/service-schema/**`, `fixtures/repository-service/**` | minimal pass/fail examples and regression proof |
| Live repository root | `service.yaml`, `contracts/**`, `schemas/**`, `product-spec.md` | actual deployment unit contract validation |

## Rule implementation contract

- Use source proof when available.
- Keep rule IDs stable and specific.
- Prefer catalog-driven decisions over code constants.
- Add fixture coverage for new policy gates.
- Keep warning/error severity aligned with policy risk.

## Severity guidance

- `error`: hard boundary where a deploy unit would violate ownership, schema, data, security, money, privacy, credential, AI data, or public API contract.
- `warning`: automation hygiene, release helper, stale bot, performance budget, security header, asset size, or similar readiness gap that should not block early experiment work unless promoted by `zdp-architecture`.

Severity changes must identify the source that justifies the move.

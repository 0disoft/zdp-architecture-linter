# Release

Status: Active

## Current release posture

`zdp-architecture-linter` is an internal private package. Public GitHub visibility does not mean npm public publish. `package.json` keeps `private: true`.

## Version source

The version source is `package.json`. Rule behavior, CLI output, package metadata, or user-visible docs changes may require a version bump under the workspace release policy.

## Release blockers

- CLI output contract changed without tests.
- Rule ID or severity changed without source proof and CHANGELOG entry.
- Package metadata changed without package surface review.
- `service.yaml` automation contract and actual GitHub workflow drift.
- Secret, customer payload, provider payload, or private incident detail appears in fixture, generated output, or report.

## Release evidence

Before calling a release-ready change complete, report:

- changed rule IDs or CLI commands
- tests/intents run
- architecture repository validation result
- package visibility boundary
- skipped package surface or CI checks

Actual npm publish or GitHub release automation is out of scope for this repository unless a separate release contract is added.

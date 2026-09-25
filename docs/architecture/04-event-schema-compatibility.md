# Event Schema Compatibility Gate

Status: Active

## 목적

`zdp-arch diff`는 Git base와 head의 `schemas/events/*.vN.json`을 비교해 이미 배포된 이벤트 계약을 같은 버전에서 깨는 변경을 차단한다. 일반 `validate`는 현재 checkout 자체의 정합성을 확인하고, 과거 계약과의 비교는 `diff`가 소유한다.

정책 원천은 `zdp-architecture`의 이벤트 스키마 호환성 계약이다. 이 저장소는 해당 정책을 `ZDP-EVENT-004`와 `ZDP-EVENT-005` 진단으로 실행한다.

## 차단 범위

`ZDP-EVENT-004`는 기존 버전 파일 삭제와 같은 버전 안의 호환되지 않는 변경을 차단한다. 필수 필드 추가·삭제, 기존 property 삭제, type 변경, enum 값 삭제, const 변경, `$ref` 또는 조합 schema 변경, 최소·최대·pattern·format·uniqueItems·additionalProperties 제약 강화가 포함된다.

선택 property 추가, enum 값 추가, title·description·examples 같은 annotation 수정은 같은 버전에서 허용한다.

`ZDP-EVENT-005`는 새 버전이 직전 버전과 호환되지 않을 때 아래 metadata와 실제 Markdown 파일을 요구한다.

```json
{
  "x-zdp-compatibility": {
    "classification": "breaking",
    "previous_schema_ref": "schemas/events/example.v1.json",
    "consumer_migration_refs": [
      "docs/migrations/example-v2.md"
    ]
  }
}
```

migration reference는 `docs/` 또는 `adr/` 아래의 repository-relative Markdown 경로만 허용한다. 경로 순회, 절대 경로, 중복, 존재하지 않는 파일은 실패한다.

## 실행 경계

이 검사는 `zdp-arch diff --base <ref> --head <ref|worktree>`에서만 실행한다. `--fail-on-new-error`가 없으면 결과를 report-only로 보여주고, 옵션이 있으면 새 오류 진단에 exit `1`을 반환한다. 스키마 파일이나 migration 문서를 자동 생성하거나 수정하지 않는다.

# SARIF Output

Status: Active

## Purpose

`zdp-arch validate --format sarif`는 기존 architecture validation 결과를 GitHub code scanning과 범용 SARIF consumer가 읽을 수 있는 SARIF 2.1.0 log로 변환한다. SARIF는 새 정책 판단을 하지 않고 `ValidationResult`를 다른 출력 형식으로 직렬화한다.

## Command

```shell
zdp-arch validate \
  --architecture ../zdp-architecture \
  --repository . \
  --format sarif > zdp-architecture.sarif
```

`--format sarif`는 `validate`에서만 허용한다. `--json`과 동시에 지정할 수 없다. 결과에 error가 있으면 SARIF를 출력한 뒤 exit `1`, warning만 있거나 진단이 없으면 exit `0`을 반환한다.

## Stable diagnostic identity

기본 fingerprint는 아래 값을 NUL 문자로 연결하고 SHA-256으로 계산한다.

1. `zdp-architecture-linter/diagnostic/v1`
2. trim한 `ruleId`
3. slash를 `/`로 통일하고 선행 `./`을 제거한 `file`
4. trim한 logical `path`

message와 severity는 identity 입력에서 제외한다. 문장 교정이나 warning에서 error로 승격하는 변경이 같은 논리 위치를 잃지 않게 하기 위해서다. `architecture diff`는 fingerprint 뒤에 severity를 별도로 결합하므로 severity 승격과 하향은 계속 added/resolved 변화로 표시한다.

규칙 하나가 같은 file/path에서 독립적인 진단을 둘 이상 만들거나, source 위치 이동 뒤에도 identity를 보존해야 하면 `Diagnostic.fingerprint`에 producer-owned 값을 명시한다. 빈 값은 무시하고 기본 fingerprint로 돌아간다.

## SARIF mapping

| ZDP diagnostic | SARIF 2.1.0 |
| --- | --- |
| `ruleId` | `result.ruleId`, `tool.driver.rules[].id` |
| `severity` | `result.level` |
| `message` | `result.message.text` |
| `file` | `locations[0].physicalLocation.artifactLocation.uri` |
| `path` | `locations[0].logicalLocations[0].fullyQualifiedName` |
| stable fingerprint | `partialFingerprints.primaryLocationLineHash`, `partialFingerprints.zdpDiagnostic/v1` |
| `sourceProof` | result property와 rule help/source proof metadata |
| `helpUri` | matching rule descriptor의 `helpUri` |

artifact URI는 source-relative slash path를 segment별 URI encoding한다. source line을 추측하지 않으며 ZDP YAML/contract path는 logical location으로 보존한다.

GitHub가 읽는 `primaryLocationLineHash`는 `<fingerprint>:1` 형식이다. `zdpDiagnostic/v1`은 같은 identity를 범용 SARIF consumer와 내부 도구에 노출하는 versioned hierarchical key다.

## Data boundary

SARIF에는 source file 본문, generated output 본문, secret, 고객 원문, provider payload, private incident detail을 넣지 않는다. `sourceProof`와 `helpUri`는 경로 또는 문서 참조만 담는다.

## Compatibility

다음 변경은 SARIF 호환성 검토가 필요하다.

- fingerprint namespace 또는 입력 필드 변경
- `zdpDiagnostic/v1` property version 변경
- rule ID 의미 재사용
- artifact URI 또는 logical path 정규화 변경
- source proof가 민감한 원문을 포함하도록 확대되는 변경

호환성 변경에는 fingerprint 단위 테스트, message-only diff 회귀 테스트, SARIF report 테스트와 CLI end-to-end 테스트를 함께 갱신한다.

# Evidence-backed state transition gate

Status: Active

`zdp-arch diff`는 `rules/tier.rules.yaml`의 `state_transition_evidence` 정책을 읽어 서비스와 운영자산의 위험 상태 전이를 검증한다.

## 적용 범위

정책이 지정한 상태로 새 항목을 바로 추가하거나 기존 항목의 상태를 변경하면 `transition_evidence`가 필요하다. 기본 정책은 서비스의 `active`, `scaling`과 운영자산의 `active` 진입을 막는다.

기존 상태가 없는 신규 항목은 `from_status: absent`로 기록한다. 같은 상태를 유지한 채 다른 필드만 바꾸는 PR에는 이 gate가 적용되지 않는다.

## 필수 증거

`transition_evidence`는 실제 이전 상태와 새 상태, 검증일, 비밀값을 포함하지 않는 증거 참조, 런북, 롤백 경로, 관측성 경로, 월 비용 상한을 기록한다. 검증일은 정책의 `evidence_max_age_days` 안에 있어야 한다.

운영자산은 `transition_evidence.verified_at`과 `evidence.last_verified_at`이 같아야 하며, 전이 증거 참조가 기존 `evidence.refs`에도 포함되어야 한다.

## 진단

`ZDP-STATE-TRANSITION-000`은 정책 자체가 잘못된 경우 발생한다.

`ZDP-STATE-TRANSITION-001`은 서비스 상태 전이 증거가 없거나 불완전한 경우 발생한다.

`ZDP-STATE-TRANSITION-002`는 운영자산 활성화 증거가 없거나 기존 운영 증거와 맞지 않는 경우 발생한다.

PR CI는 `zdp-arch diff --fail-on-new-error`를 사용해 새 전이 오류를 차단한다. 기존 base ref에 있던 정적 오류를 이 gate가 새 오류로 재분류하지 않는다.

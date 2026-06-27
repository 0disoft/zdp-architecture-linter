# Security

## 비밀값

- 이 저장소는 실제 provider token, API key, KMS key, webhook secret, database credential을 보관하지 않는다.
- fixture에는 실제 토큰 형식처럼 보이는 문자열을 넣지 않는다. 실패 케이스가 필요하면 명시적인 가짜 토큰 이름이나 금지 필드 이름만 쓴다.
- CLI 출력과 테스트 snapshot은 raw secret, 고객 payload, private incident evidence를 포함하지 않아야 한다.

## 데이터 접근

- 이 저장소는 `zdp-architecture`의 카탈로그와 저장소 루트 계약을 읽어 검증하지만, 제품 데이터베이스나 provider API를 직접 조회하지 않는다.
- 저장소 검증은 로컬 파일 시스템의 선택된 repository root와 architecture root 안에서만 수행한다.
- `generated/` 산출물은 검증 가능한 요약과 registry만 담고, 원본 비밀값이나 운영 데이터 덤프를 담지 않는다.

## 권한 경계

- linter는 정책 집행 gate이지 정책 원천이 아니다. 새 차단 규칙은 `zdp-architecture` 문서, 스키마, 카탈로그, 규칙 파일, fixture 중 하나에서 추적 가능해야 한다.
- 구현 편의를 이유로 돈, 개인정보, credential, AI 사용자 데이터, 감사 경계 차단을 경고로 낮추지 않는다.
- 카탈로그에서 읽을 수 있는 실제 ZDP 저장소 목록을 코드에 하드코딩하지 않는다.

## 금지 작업

- 실제 배포, GitHub 저장소 생성, secret rotation, 데이터베이스 마이그레이션을 이 저장소의 CLI에 넣지 않는다.
- 외부 네트워크 호출을 검증의 필수 조건으로 만들지 않는다.
- 검증 실패를 숨기기 위해 fixture expectation을 완화하지 않는다.

## 공개 저장소 경계

- GitHub 저장소 공개 전환은 npm 공개 배포와 별개다. 이 패키지는 `package.json`의 `private: true`를 유지한다.
- `LICENSE`가 추가되기 전까지 이 저장소 공개는 소스 열람을 허용하는 것이며, 별도의 오픈소스 재사용 권리를 부여하지 않는다.
- 공개 전환 전에 secret scanner 경고를 확인하되, 테스트 fixture의 금지 필드 이름은 실제 비밀값으로 취급하지 않는다.

## 취약점 대응

- 잘못된 통과가 발견되면 실패 fixture나 단위 테스트를 먼저 추가한다.
- 잘못된 차단이 발견되면 원천 계약과 진단 조건을 비교하고, 조건을 좁힌 뒤 회귀 테스트를 남긴다.
- 보안 경계와 관련된 규칙 변경은 CHANGELOG에 차단 의미를 기록한다.

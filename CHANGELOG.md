# Changelog

이 파일은 사용자에게 보이는 변경 요약뿐 아니라, `kpopuniverse` 본체와 이 저장소를 함께 다루는 Claude Code/Codex 작업자가 판단 근거를 잃지 않도록 남기는 운영 기록이다.

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 느슨하게 따른다.

## [Unreleased]

### Security

- `api/cron/snapshot-ranks`가 `CRON_SECRET` 없이 공개 쓰기 트리거가 되던 fail-open 동작을 제거했다. 이제 환경변수가 없으면 `500 CRON_SECRET not configured`, 토큰이 다르면 `401 unauthorized`으로 종료하며 Supabase를 읽거나 쓰지 않는다.
- 이 엔드포인트는 `SUPABASE_SERVICE_ROLE_KEY`로 upsert하므로, 인증 검사를 선택 사항으로 되돌리지 않는다. Vercel 환경변수 설정과 Cron의 Bearer 토큰 전달을 함께 확인해야 한다.

### Added

- 의존성 없는 Node 내장 테스트를 추가했다. 인증 실패 경로와 순위 필터의 핵심 보조 함수를 다룬다.
- README에 배포 환경변수, KST 기준 Cron 시각, Supabase/RLS 점검 항목, 메인 앱과의 차트 동기화 규칙을 기록했다.
- `.gitignore`로 Vercel 메타데이터와 환경 파일의 우발적 커밋을 막는다.

### Collaboration note

순위 로직은 두 저장소에 존재한다. 이 저장소만 수정해도 메인 앱과 결과가 달라질 수 있다. 특히 필터 상수·정규식·쿼리·limit을 바꾸는 작업은 반드시 `kpopuniverse` 본체의 대응 코드와 함께 검토하고, 실제 차트의 항목 및 순서가 일치하는지 확인한다. 과거에도 동기화 누락으로 거짓 `NEW` 배지가 발생했으며, 2026-09-18, 2026-09-30, 2026-10-12, 2026-10-15 커밋이 그 사례를 수정했다.

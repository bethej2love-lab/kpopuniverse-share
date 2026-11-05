# kpopuniverse-share

`kpop-universe.kr`의 공유 미리보기와 일간 순위 스냅샷을 담당하는 작은 Vercel 서버리스 프로젝트다. 메인 앱은 GitHub Pages의 정적 사이트이므로, 요청별 Open Graph 태그와 예약 실행이 필요한 기능만 이 저장소에 둔다.

## 구성

| 경로 | 역할 |
| --- | --- |
| `api/col/[id].js` | 공개 컬렉션을 조회해 Open Graph/Twitter 메타태그를 응답하고 앱으로 이동시킨다. |
| `api/cron/snapshot-ranks.js` | (2026-11-05 은퇴 — 크론 해제) 예전 주간 직캠·월간 퍼포먼스 순위 기록. 이제 메인 레포 `tools/snapshot_charts.cjs`(GitHub Actions)가 앱 함수 그대로 기록한다. |
| `vercel.json` | `/col/:id` 라우팅, 루트 리다이렉트, Cron 일정을 정의한다. |

## 배포 환경변수

Vercel Production과 Preview에 아래 값을 설정한다. 값 자체는 커밋하거나 로그로 출력하지 않는다.

| 변수 | 필수 | 용도 |
| --- | --- | --- |
| `CRON_SECRET` | **필수** | `snapshot-ranks` 쓰기 엔드포인트를 보호한다. 누락 시 함수는 의도적으로 500을 반환한다. Vercel Cron이 같은 값을 Bearer 토큰으로 보낸다. |
| `SUPABASE_SERVICE_ROLE_KEY` | **필수(크론)** | 순위 스냅샷 upsert용 서비스 역할 키. 클라이언트나 공개 응답에 노출하면 안 된다. |
| `SUPABASE_URL` | 선택 | 기본 K-POP UNIVERSE Supabase 프로젝트를 바꿔야 할 때만 설정한다. |
| `SUPABASE_ANON_KEY` | 선택 | 공개 컬렉션 조회용 publishable 키를 바꿔야 할 때만 설정한다. RLS가 공개 읽기를 정확히 제한해야 한다. |

크론은 `0 5 * * *`가 아니라 `5 0 * * *`, 즉 매일 **UTC 00:05 / KST 09:05**에 실행된다.

## 차트 동기화 규칙

`snapshot-ranks.js`는 메인 `kpopuniverse` 앱의 차트 계산을 의도적으로 재현한다. 두 구현 중 하나만 바뀌면 같은 영상이 화면에서는 순위에 있고 스냅샷에는 없어 잘못된 `NEW` 배지가 생긴다.

메인 앱의 아래 항목을 바꾸면 이 저장소도 같은 변경에서 갱신하고 테스트를 추가/수정한다.

- 라이브 제외 목록과 안무 영상 제외 조건
- 금칙 영상명 필터
- 쇼츠 판정 기준
- 직캠 브랜드·홍보물 정규식
- 쿼리 기간, 정렬, 풀 제한(현재 7일/300건, 30일/500건)
- 그룹별 최대 노출 수와 최종 차트 길이

## 검증

Node.js 20 이상에서 실행한다. 외부 패키지는 없다.

```sh
npm test
```

테스트는 보안상 중요한 fail-closed 인증과 차트 보조 함수의 핵심 규칙을 검증한다. 배포 전에는 메인 앱과 실제 결과의 항목과 순서도 비교한다.

## 운영 점검

- Vercel의 `CRON_SECRET`와 Supabase 서비스 역할 키가 모든 필요한 배포 환경에 설정돼 있는지 확인한다.
- Supabase의 `public_collections` 및 `collection_like_counts` RLS/뷰 권한이 의도한 공개 데이터만 반환하는지 확인한다.
- Vercel Cron 실행 기록과 응답의 `inserted`, `solo_cam`, `monthly_stage` 값을 주기적으로 확인한다.
- 소스 변경은 PR 또는 최소한 `npm test` 통과 후 배포한다.

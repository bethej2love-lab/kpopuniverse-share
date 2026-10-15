// 탐험 패널 "주간 개인 직캠 TOP 20" / "월간 무대 TOP 30" 순위 변동 배지용 일간 스냅샷 (2026-08-21)
// GitHub Pages는 서버가 없어서 스스로 도는 스케줄러가 없었음 — 이 프로젝트(Vercel)가 생기면서 Cron Job이
// 처음으로 가능해짐. 매일 한 번 두 차트의 "오늘 순위"를 rank_snapshots에 저장해두면, 프론트는 직전 날짜
// 스냅샷과 오늘 계산 결과를 비교해서 ▲/▼/NEW 배지를 붙인다(집계 기간 자체는 그대로 롤링 7일/30일 —
// 바뀌는 건 "비교 주기"만 일간이라는 점, 사용자 지적으로 주간→일간으로 변경).
// vercel.json의 crons가 매일 이 엔드포인트를 호출한다. Vercel이 Cron 호출 시 자동으로 실어 보내는
// Authorization: Bearer $CRON_SECRET 헤더로 외부에서의 무단 호출을 막는다(CRON_SECRET 환경변수 설정 시).
// 쓰기(upsert)라서 anon key로는 RLS에 막히므로 SUPABASE_SERVICE_ROLE_KEY가 반드시 필요 — Vercel 프로젝트
// 설정의 환경변수로만 넣고 코드/커밋에는 절대 하드코딩하지 않는다.
//
// ⚠️⚠️ 이 파일은 kpopuniverse/index.html의 차트 계산을 **그대로 베껴야 한다**. 두 곳에서 같은 차트를
//   따로 계산하는 구조라, 한쪽만 바뀌면 스냅샷과 화면이 서로 다른 목록이 되고 겹치지 않는 항목이 전부
//   "NEW"로 찍힌다. 실제로 그렇게 어긋나 있었다(2026-09-18 실측: 월간 무대 30자리 중 15개가 스냅샷에
//   없어 절반이 NEW, 직캠은 화면 11 vs 스냅샷 15). 원인은 이 파일이 아래를 못 따라간 것:
//     · content_flag '보류' 제외          · _applyLiveExclude(제목 [live] / _LIVE_EXCLUDE / 안무영상)
//     · _filterBannedVideos(금칙 이름)     · 월간 무대의 쇼츠 제외(2026-09-10 추가)
//     · 직캠 판정(_isSoloCam)의 PROMO 제외 2단 구조   · 7일 풀 limit 300(500 아님)
//   index.html에서 아래 심볼을 고칠 때 **반드시 여기도 같이 고칠 것**:
//     _LIVE_EXCLUDE · _STAGE_EXCLUDE_FORMATS · _BANNED_VIDEO_NAMES_GLOBAL · _FANCAM_BRAND_RE ·
//     _FANCAM_PROMO_RE · _SHORT_CLIP_SEC · _isSoloCam · _isShortClip · _filterBannedVideos ·
//     _buildFeedWeeklyTopCams의 쿼리(기간/limit/content_flag)
//   (프론트에는 이 파일이 또 어긋나도 거짓 NEW는 안 뜨게 하는 가드가 있다 — index.html의 _withRankDelta
//    주석 참고. published_at이 스냅샷 날짜 이후인 영상만 NEW로 본다.)

// ── index.html에서 그대로 옮긴 상수/판정 ──────────────────────────────────
const LIVE_EXCLUDE = ['엠카드림', '비하인드', 'behind', '생일 라이브', '생일라이브', 'birthday live', '실시간 라이브'];            // _LIVE_EXCLUDE
const STAGE_EXCLUDE_FORMATS = ['안무영상'];                          // _STAGE_EXCLUDE_FORMATS
const SHORT_CLIP_SEC = 90;                                           // _SHORT_CLIP_SEC
const BANNED_VIDEO_NAMES_GLOBAL = ['seungri', '태일', 'taeil', 'himchan', '종훈', 'jonghun', 'kris', '용준형', 'yong jun hyung', 'yong jun hyeong', 'yongjunhyung'];
// 영문만으로 된 이름은 단어 경계를 붙인다(부분 일치 오탐 방지) — index.html의 _bannedGlobalRe와 동일 규칙
const BANNED_GLOBAL_RE = new RegExp(
  BANNED_VIDEO_NAMES_GLOBAL.map(n => (/^[\x20-\x7E]+$/.test(n) ? '\\b' + n + '\\b' : n)).join('|'), 'i');
const FANCAM_BRAND_RE = /직캠|팬캠|페이스캠|풀캠|세로캠|얼빡|입덕직캠|팔로우캠|원픽캠|보컬캠|보이스캠|최애캠|앵콜캠|단독샷|안방\s*1\s*열|포커스캠|개인캠|멤버캠|FAN\s*CAM|FACE\s*CAM|FULL\s*CAM|VOICE\s*CAM|PICK\s*CAM|FOCUS\s*CAM|SOLO\s*CAM|MEMBER\s*CAM|VERTICAL\s*CAM|UNFILTERED\s*CAM|CLOSE\s*UP\s*CAM/i;
// 2026-09-30: 화면(index.html _FANCAM_PROMO_RE)이 09-26에 "시즌N EP.N 예능 에피소드 제외"를 추가했는데 여기만 안 따라와서
// 스냅샷과 화면 차트가 달라졌다(→ 거짓 NEW 배지 원인). parity 테스트가 CI에서 이 레포를 못 봐 스킵되던 것도 같이 고침.
// 2026-10-12: 화면이 09-30에 공항·생일 기념 직캠 제외 + '입덕'→'입덕직캠'으로 좁힌 걸 또 못 따라왔다(parity 테스트 빨간불).
// ⚠️ index.html의 _FANCAM_BRAND_RE/_FANCAM_PROMO_RE를 바꾸면 여기도 같이 — tests/chart-snapshot-parity.test.js가 대조한다.
const FANCAM_PROMO_RE = /비하인드|보고서|메이킹|예고|티저|리액션|코멘터리|BEHIND|MAKING|TEASER|REACTION|COMMENTARY|시즌\s*\d+\s*EP\.?\s*\d+|공항|생일\s*기념/i;

// 대괄호 **밖의** 해시태그만 떼어낸다 — 음방명이 해시태그로만 달린 홍보 영상이 직캠으로 잡히는 걸 막되,
// 제목 본문의 [쇼챔1분직캠] 같은 진짜 브랜드 표기는 살린다(index.html _fancamStripLooseHashtags와 동일).
export function stripLooseHashtags(t) {
  let out = '', buf = '', depth = 0;
  for (const ch of String(t || '')) {
    if (ch === '[' || ch === '［') { depth++; out += buf.replace(/#[^\s#]*/g, ' '); buf = ''; out += ch; continue; }
    if (ch === ']' || ch === '］') { if (depth) depth--; out += ch; continue; }
    if (depth > 0) out += ch; else buf += ch;
  }
  return out + buf.replace(/#[^\s#]*/g, ' ');
}
// ⚠️ duration_sec의 0은 "0초"가 아니라 "확인했지만 길이를 모름"이다(진행 중 라이브의 P0D, 백필 실패 표식).
//    0을 그대로 믿으면 0<=90이라 정상 영상이 전부 쇼츠로 오분류된다 — >0만 신뢰하고 아니면 세로 여부로 근사.
export function isShortClip(v) {
  if (!v) return false;
  if (v.duration_sec != null && v.duration_sec > 0) return v.duration_sec <= SHORT_CLIP_SEC;
  return v.is_short === true || v.category === 'short';
}
export function isSoloCam(v) {
  if (!v || (v.members || []).length !== 1) return false;
  if (isShortClip(v)) return false;
  const t = v.title || '';
  if (FANCAM_PROMO_RE.test(t)) return false;
  return FANCAM_BRAND_RE.test(stripLooseHashtags(t));
}
export function filterBanned(list) {
  return (list || []).filter(v => !BANNED_GLOBAL_RE.test(v.title || '')
    && v.content_flag !== 'hidden' && v.content_flag !== '무관' && v.content_flag !== '보류');
}
export function capByGroup(vids, maxPerKey) {
  const seen = new Map();
  return vids.filter(v => {
    const k = v.group_ko || '__etc__';
    const n = seen.get(k) || 0;
    if (n >= maxPerKey) return false;
    seen.set(k, n + 1);
    return true;
  });
}

// index.html의 _applyLiveExclude + 쿼리 조건을 그대로 REST 파라미터로 옮긴 것.
// ⚠️ content_flag는 NULL이 정상값이라 not.in만 쓰면 NULL 행이 통째로 사라진다(SQL NOT IN의 NULL 함정) —
//    반드시 or=(is.null, not.in.(...)) 형태로 묶는다.
export async function fetchPool(SUPABASE_URL, headers, sinceDate, limit) {
  const params = [
    'select=id,title,group_ko,members,view_count,published_at,is_short,category,content_flag,duration_sec',
    'category=eq.live',
    `published_at=gte.${sinceDate}`,
    'view_count=not.is.null',
    `or=(content_flag.is.null,content_flag.not.in.(${encodeURIComponent('기타,무관,보류,hidden')}))`,
    `title=not.ilike.${encodeURIComponent('%[live]%')}`,
    ...LIVE_EXCLUDE.map(k => `title_norm=not.ilike.${encodeURIComponent('%' + k + '%')}`),
    ...STAGE_EXCLUDE_FORMATS.map(f => `content_formats=not.cs.${encodeURIComponent('{' + f + '}')}`),
    'order=view_count.desc',
    `limit=${limit}`,
  ].join('&');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/yt_channel_videos?${params}`, { headers });
  if (!r.ok) throw new Error(`pool fetch ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

export default async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${CRON_SECRET}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dukgguehegnembimqvkm.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
    return;
  }
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  const today = new Date().toISOString().slice(0, 10);
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  try {
    // ⚠️ limit도 화면과 같아야 한다 — 7일 풀은 300, 30일 풀은 500(index.html의 두 쿼리).
    //    여기서 더 많이 받으면 상위 목록이 달라져 순위가 통째로 어긋난다.
    const [pool7, pool30] = await Promise.all([
      fetchPool(SUPABASE_URL, headers, since7, 300),
      fetchPool(SUPABASE_URL, headers, since30, 500),
    ]);

    const soloCam = capByGroup(filterBanned(pool7).filter(isSoloCam), 3).slice(0, 20);
    // 월간 무대는 쇼츠 제외(2026-09-10) — "무대"는 방송에 나간 한 편이고 쇼츠는 거기서 잘라낸 클립이라
    // 같은 목록에 섞일 물건이 아니다. ⚠️ 직캠 차트는 반대로 세로 직캠이 정상이라 쇼츠를 그대로 둔다.
    const monthlyStage = capByGroup(filterBanned(pool30).filter(v => !isShortClip(v)), 3).slice(0, 30);

    const rows = [
      ...soloCam.map((v, i) => ({ chart_type: 'solo_cam', snapshot_date: today, video_id: v.id, rank: i + 1 })),
      ...monthlyStage.map((v, i) => ({ chart_type: 'monthly_stage', snapshot_date: today, video_id: v.id, rank: i + 1 })),
    ];
    if (!rows.length) {
      res.status(200).json({ ok: true, inserted: 0, note: 'no candidates today' });
      return;
    }

    const upsertR = await fetch(`${SUPABASE_URL}/rest/v1/rank_snapshots?on_conflict=chart_type,snapshot_date,video_id`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
    if (!upsertR.ok) {
      const errText = await upsertR.text();
      res.status(500).json({ error: 'upsert failed', detail: errText });
      return;
    }
    res.status(200).json({ ok: true, inserted: rows.length, solo_cam: soloCam.length, monthly_stage: monthlyStage.length, date: today });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

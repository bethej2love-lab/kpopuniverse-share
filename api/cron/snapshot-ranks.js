// 탐험 패널 "주간 개인 직캠 TOP 20" / "월간 무대 TOP 30" 순위 변동 배지용 일간 스냅샷 (2026-08-21)
// GitHub Pages는 서버가 없어서 스스로 도는 스케줄러가 없었음 — 이 프로젝트(Vercel)가 생기면서 Cron Job이
// 처음으로 가능해짐. 매일 한 번 두 차트의 "오늘 순위"를 rank_snapshots에 저장해두면, 프론트는 어제 날짜
// 스냅샷과 오늘 계산 결과를 비교해서 ▲/▼/NEW 배지를 붙인다(집계 기간 자체는 그대로 롤링 7일/30일 —
// 바뀌는 건 "비교 주기"만 일간이라는 점, 사용자 지적으로 주간→일간으로 변경).
// vercel.json의 crons가 매일 이 엔드포인트를 호출한다. Vercel이 Cron 호출 시 자동으로 실어 보내는
// Authorization: Bearer $CRON_SECRET 헤더로 외부에서의 무단 호출을 막는다(CRON_SECRET 환경변수 설정 시).
// 쓰기(upsert)라서 anon key로는 RLS에 막히므로 SUPABASE_SERVICE_ROLE_KEY가 반드시 필요 — Vercel 프로젝트
// 설정의 환경변수로만 넣고 코드/커밋에는 절대 하드코딩하지 않는다.

function capByGroup(vids, maxPerKey) {
  const seen = new Map();
  return vids.filter(v => {
    const k = v.group_ko || '__etc__';
    const n = seen.get(k) || 0;
    if (n >= maxPerKey) return false;
    seen.set(k, n + 1);
    return true;
  });
}

const FANCAM_TITLE_RE = /FANCAM|직캠|팬캠|엠카운트다운|뮤직뱅크|인기가요|음악중심|쇼챔피언|M\s*COUNTDOWN|MUSIC\s*BANK|INKIGAYO|MUSIC\s*CORE|SHOW\s*CHAMPION|\bTHE\s+SHOW\b/i;

async function fetchPool(SUPABASE_URL, headers, sinceDate) {
  const params = [
    'select=id,title,group_ko,members,view_count,published_at',
    'category=eq.live',
    `published_at=gte.${sinceDate}`,
    'view_count=not.is.null',
    'or=(content_flag.is.null,content_flag.neq.기타)',
    'or=(content_flag.is.null,content_flag.neq.무관)',
    'or=(content_flag.is.null,content_flag.neq.hidden)',
    'order=view_count.desc',
    'limit=500',
  ].join('&');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/yt_channel_videos?${params}`, { headers });
  if (!r.ok) return [];
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
    const [pool7, pool30] = await Promise.all([
      fetchPool(SUPABASE_URL, headers, since7),
      fetchPool(SUPABASE_URL, headers, since30),
    ]);

    const soloCam = capByGroup(
      pool7.filter(v => FANCAM_TITLE_RE.test(v.title) && (v.members || []).length === 1),
      3
    ).slice(0, 20);
    const monthlyStage = capByGroup(pool30, 3).slice(0, 30);

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
    res.status(200).json({ ok: true, inserted: rows.length, date: today });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

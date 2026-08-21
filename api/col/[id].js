// 컬렉션 공유 링크 미리보기(OG 태그) 전용 서버리스 함수 (2026-08-21)
// GitHub Pages는 완전 정적 호스팅이라 요청마다 다른 og:image/제목을 못 내려줌 — 그래서 이 함수 하나만
// Vercel에 따로 올려서, 링크 미리보기(네이버 블로그/카카오톡/X 등)를 만드는 봇에게는 그 컬렉션 전용
// OG 태그를 보여주고, 실제 사람이 클릭하면 곧바로 진짜 앱(kpop-universe.kr/#col=id)으로 넘긴다.
// 라우팅: vercel.json의 rewrites가 /col/:id 요청을 이 파일로 보낸다.
export default async function handler(req, res) {
  const { id } = req.query;
  const SITE = 'https://kpop-universe.kr';
  const appUrl = `${SITE}/#col=${encodeURIComponent(id || '')}`;

  if (!id) {
    res.writeHead(302, { Location: SITE });
    res.end();
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dukgguehegnembimqvkm.supabase.co';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_SjNC-N_9TUqaQcCxhVinGA_ULyX6tA0';

  let col = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/public_collections?id=eq.${encodeURIComponent(id)}&select=id,name,items,cover_img,share_card_img,desc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const data = await r.json();
    col = Array.isArray(data) ? data[0] : null;
  } catch (e) { /* 조회 실패 — 아래에서 col null 처리 */ }

  // 컬렉션을 못 찾음(삭제됐거나 비공개로 바뀜) — 조용히 앱으로 보냄(에러 페이지 대신 "만료된 링크" 취급)
  if (!col) {
    res.writeHead(302, { Location: appUrl });
    res.end();
    return;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const items = col.items || [];
  const count = items.length;
  const name = col.name || 'K-POP UNIVERSE 컬렉션';
  // share_card_img: 앱이 만든 브랜드 카드(공유 버튼 누를 때 Supabase Storage에 업로드해둔 것) — 있으면
  // 최우선. 아직 아무도 공유 버튼을 안 눌러본 컬렉션(share_card_img 없음)은 커스텀 표지 → 첫 영상
  // 썸네일 순으로 폴백(2026-08-21).
  const image = col.share_card_img || col.cover_img || (items[0] && items[0].thumb) || `${SITE}/og-image.png`;
  const desc = col.desc || `${count}개 영상 · K-POP UNIVERSE에서 이 컬렉션을 확인해보세요`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(name)} | K-POP UNIVERSE</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="K-POP UNIVERSE">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(appUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(name)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(appUrl)}">
<script>location.replace(${JSON.stringify(appUrl)});</script>
</head>
<body>
<p>K-POP UNIVERSE로 이동 중… 자동으로 안 넘어가면 <a href="${esc(appUrl)}">여기</a>를 눌러주세요.</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(html);
}

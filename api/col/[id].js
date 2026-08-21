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

  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  let col = null, likes = 0;
  try {
    const [colR, likeR] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/public_collections?id=eq.${encodeURIComponent(id)}&select=id,name,items,cover_img,share_card_img,desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/collection_like_counts?collection_id=eq.${encodeURIComponent(id)}&select=like_count`, { headers }),
    ]);
    const data = await colR.json();
    col = Array.isArray(data) ? data[0] : null;
    const likeData = await likeR.json();
    likes = (Array.isArray(likeData) && likeData[0] && likeData[0].like_count) || 0;
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
  // 스포티파이 공유 링크 스타일(2026-08-21, 사용자 요청) — "collection · 이름 · N items · M saves"
  // 한 줄로 제목 자체를 구성. 대부분의 미리보기 카드가 제목+도메인만 보여주고 description은 아예
  // 안 보여주는 경우가 많아서(카카오톡 등), 핵심 정보를 제목 한 줄에 다 담는다.
  const title = `Collection · ${name} · ${count} item${count === 1 ? '' : 's'} · ${likes} save${likes === 1 ? '' : 's'}`;
  const desc = col.desc || `${count}개 영상 · K-POP UNIVERSE에서 이 컬렉션을 확인해보세요`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="K-POP UNIVERSE">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(appUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
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

import assert from 'node:assert/strict';
import test from 'node:test';

import handler, {
  capByGroup,
  filterBanned,
  isShortClip,
  isSoloCam,
  stripLooseHashtags,
} from '../api/cron/snapshot-ranks.js';

function responseRecorder() {
  return {
    code: null,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('cron fails closed when CRON_SECRET is absent', async () => {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const res = responseRecorder();
    await handler({ headers: {} }, res);
    assert.equal(res.code, 500);
    assert.deepEqual(res.body, { error: 'CRON_SECRET not configured' });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test('cron rejects an invalid bearer token before reading or writing data', async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret';
  try {
    const res = responseRecorder();
    await handler({ headers: { authorization: 'Bearer wrong-secret' } }, res);
    assert.equal(res.code, 401);
    assert.deepEqual(res.body, { error: 'unauthorized' });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test('chart helpers retain the documented filtering semantics', () => {
  assert.equal(stripLooseHashtags('#홍보 [쇼챔1분직캠] 아티스트'), '  [쇼챔1분직캠] 아티스트');
  assert.equal(isShortClip({ duration_sec: 0, is_short: false }), false);
  assert.equal(isShortClip({ duration_sec: 90 }), true);
  assert.equal(isSoloCam({ members: ['member'], duration_sec: 180, title: '[직캠] 무대' }), true);
  assert.equal(isSoloCam({ members: ['member'], duration_sec: 180, title: '생일 기념 직캠' }), false);
  assert.deepEqual(filterBanned([{ title: '정상 영상' }, { title: 'taeil video' }, { title: '보류', content_flag: '보류' }]), [{ title: '정상 영상' }]);
  assert.deepEqual(capByGroup([{ group_ko: 'A' }, { group_ko: 'A' }, { group_ko: 'B' }], 1), [{ group_ko: 'A' }, { group_ko: 'B' }]);
});

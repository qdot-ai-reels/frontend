import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isExplicitSubmissionRejection,
  normalizeStudioScript,
  parseApiDate,
  parsePendingSubmission,
  resolveSafeMediaUrl,
} from '../lib/studio-normalization.ts';

test('normalizes the persisted backend scene shape without requiring summary', () => {
  const script = normalizeStudioScript({
    scenes: [
      {
        section: 'Hook',
        time_range_sec: { start: 0, end: 1.5 },
        visual: '상품을 화면 중앙에 보여준다',
        auditory: { voiceover: '첫 문장', subtitle: '첫 자막' },
      },
    ],
  });

  assert.deepEqual(script, {
    summary: null,
    scenes: [
      {
        id: 'Hook',
        label: 'Hook',
        startSeconds: 0,
        endSeconds: 1.5,
        visual: '상품을 화면 중앙에 보여준다',
        voiceover: '첫 문장',
        subtitle: '첫 자막',
        notes: null,
      },
    ],
  });
});

test('drops invalid ranges instead of inventing a canonical script', () => {
  assert.equal(
    normalizeStudioScript({
      scenes: [{ section: 'Hook', time_range_sec: { start: 2, end: 1 } }],
    }),
    null,
  );
});

test('keeps a recoverable pending submission identifier', () => {
  const pending = parsePendingSubmission(
    JSON.stringify({
      clientRequestId: 'client-123',
      quoteId: 'quote-456',
      createdAt: '2026-09-04T01:02:03Z',
    }),
  );

  assert.deepEqual(pending, {
    clientRequestId: 'client-123',
    quoteId: 'quote-456',
    createdAt: '2026-09-04T01:02:03Z',
  });
  assert.equal(parsePendingSubmission('{broken'), null);
});

test('only clears pending submission state for explicit non-timeout 4xx responses', () => {
  assert.equal(isExplicitSubmissionRejection(409), true);
  assert.equal(isExplicitSubmissionRejection(422), true);
  assert.equal(isExplicitSubmissionRejection(408), false);
  assert.equal(isExplicitSubmissionRejection(500), false);
  assert.equal(isExplicitSubmissionRejection(null), false);
});

test('interprets backend naive ISO timestamps as UTC', () => {
  assert.equal(parseApiDate('2026-09-04T01:02:03')?.toISOString(), '2026-09-04T01:02:03.000Z');
  assert.equal(parseApiDate('not-a-date'), null);
});

test('allows HTTPS or same-origin API media and rejects unsafe schemes and remote HTTP', () => {
  const apiBase = 'http://127.0.0.1:8001';
  assert.equal(
    resolveSafeMediaUrl('/api/v1/reels/generate/job/file', apiBase),
    'http://127.0.0.1:8001/api/v1/reels/generate/job/file',
  );
  assert.equal(resolveSafeMediaUrl('https://cdn.example.com/video.mp4', apiBase), 'https://cdn.example.com/video.mp4');
  assert.equal(resolveSafeMediaUrl('http://cdn.example.com/video.mp4', apiBase), null);
  assert.equal(resolveSafeMediaUrl('javascript:alert(1)', apiBase), null);
  assert.equal(resolveSafeMediaUrl('https://user:secret@cdn.example.com/video.mp4', apiBase), null);
});

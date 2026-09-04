import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isIdentityReferenceProductionEnabled,
  normalizeStudioScript,
  rejectedSubmissionDisposition,
  parseApiDate,
  parsePendingSubmission,
  resolveSafeMediaUrl,
} from '../lib/studio-normalization.ts';

test('keeps identity references disabled without an audited deployment flag', () => {
  assert.equal(
    isIdentityReferenceProductionEnabled('bytedance/seedance-2.0', undefined),
    false,
  );
  assert.equal(
    isIdentityReferenceProductionEnabled('bytedance/seedance-2.0', 'false'),
    false,
  );
  assert.equal(
    isIdentityReferenceProductionEnabled('audited/provider', 'true'),
    true,
  );
});

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
      request: {
        productId: 'product-1',
        templateId: 'ugc_full_15',
        templateVersion: '1',
        visualMode: 'generated_model',
        influencerImageUrls: [],
        outputCount: 1,
        cta: '지금 확인하세요',
        advertisingPurpose: '전환',
        channel: 'Instagram Reels',
        mustInclude: '',
        mustExclude: '',
        extraDetails: '',
        promptVersionId: null,
      },
      requestBody: {
        client_request_id: 'client-123',
        quote_id: 'quote-456',
        template_id: 'ugc_full_15',
      },
    }),
  );

  assert.deepEqual(pending, {
    clientRequestId: 'client-123',
    quoteId: 'quote-456',
    createdAt: '2026-09-04T01:02:03Z',
    request: {
      productId: 'product-1',
      templateId: 'ugc_full_15',
      templateVersion: '1',
      visualMode: 'generated_model',
      influencerImageUrls: [],
      outputCount: 1,
      cta: '지금 확인하세요',
      advertisingPurpose: '전환',
      channel: 'Instagram Reels',
      mustInclude: '',
      mustExclude: '',
      extraDetails: '',
      promptVersionId: null,
    },
    requestBody: {
      client_request_id: 'client-123',
      quote_id: 'quote-456',
      template_id: 'ugc_full_15',
    },
  });
  assert.equal(parsePendingSubmission('{broken'), null);
  assert.equal(
    parsePendingSubmission(
      JSON.stringify({
        clientRequestId: 'client-123',
        quoteId: 'quote-456',
        createdAt: '2026-09-04T01:02:03Z',
        requestBody: {
          client_request_id: 'different-client',
          quote_id: 'quote-456',
        },
      }),
    )?.requestBody,
    null,
  );
});

test('keeps legacy pending identifiers locked for lookup without inventing a replay body', () => {
  assert.deepEqual(
    parsePendingSubmission(
      JSON.stringify({
        clientRequestId: 'legacy-client',
        quoteId: 'legacy-quote',
        createdAt: '2026-09-04T01:02:03Z',
      }),
    ),
    {
      clientRequestId: 'legacy-client',
      quoteId: 'legacy-quote',
      createdAt: '2026-09-04T01:02:03Z',
      request: null,
      requestBody: null,
    },
  );
});

test('only requests a new quote after an authoritative rejected reservation says so', () => {
  assert.equal(rejectedSubmissionDisposition('REQUOTE_REQUIRED'), 'requote');
  assert.equal(rejectedSubmissionDisposition('QUOTE_NOT_FOUND'), 'requote');
  assert.equal(rejectedSubmissionDisposition('REQUEST_VALIDATION_FAILED'), 'rejected');
  assert.equal(rejectedSubmissionDisposition(null), 'rejected');
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

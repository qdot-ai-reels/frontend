import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  PROMPT_TEMPLATE_DEFINITIONS,
  MAX_PROMPT_TEMPLATE_BYTES,
  canAttemptPromptVersionRecovery,
  emptyPromptTemplates,
  extractPromptTokens,
  isQuotePromptVersionCurrent,
  normalizePromptVersionCatalog,
  shouldRefreshPromptVersionAfterQuoteError,
  utf8ByteLength,
  validatePromptTemplate,
  validatePromptTemplates,
} from '../lib/prompt-versions.ts';

function validTemplates() {
  return {
    ...emptyPromptTemplates(),
    script_generation:
      '상품 {{product_context}} 브리프 {{creative_brief}} 장면 {{template_scene_plan}}',
    script_tts_repair: '오류 {{retry_error}}',
    video_base: '장면 {{script_visual_table}}',
    video_identity_reference: '동일한 인물을 유지한다.',
    video_generated_model: '실존 인물을 모사하지 않는다.',
    creative_brief:
      '목적 {{advertising_purpose}} CTA {{cta}} 모드 {{visual_mode}} {{must_include}}',
  };
}

test('normalizes defensive prompt catalog variants and infers the active version', () => {
  const catalog = normalizePromptVersionCatalog({
    activeBundleId: 'bundle-2',
    items: [
      {
        bundle_id: 'bundle-2',
        version_number: 2,
        title: '한국어 개선',
        change_note: '어색한 발화 개선',
        sha256: 'abc123',
        createdAt: '2026-09-04T10:00:00Z',
        prompts: validTemplates(),
      },
      { version: 1, name: 'id가 없어 제외' },
    ],
  });

  assert.equal(catalog.activeBundleId, 'bundle-2');
  assert.equal(catalog.versions.length, 1);
  assert.equal(catalog.versions[0].isActive, true);
  assert.equal(catalog.versions[0].templates.video_base, '장면 {{script_visual_table}}');
});

test('uses active_bundle_id as the single authoritative active version', () => {
  const catalog = normalizePromptVersionCatalog({
    active_bundle_id: 'bundle-2',
    versions: [
      { id: 'bundle-1', version: 1, name: '이전', is_active: true, templates: validTemplates() },
      { id: 'bundle-2', version: 2, name: '현재', templates: validTemplates() },
    ],
  });

  assert.deepEqual(
    catalog.versions.filter((version) => version.isActive).map((version) => version.id),
    ['bundle-2'],
  );
});

test('normalizes a catalog wrapped in a data envelope', () => {
  const catalog = normalizePromptVersionCatalog({
    data: {
      active_bundle_id: 'bundle-3',
      versions: [
        { id: 'bundle-3', version: 3, name: '현재', templates: validTemplates() },
      ],
    },
  });

  assert.equal(catalog.activeBundleId, 'bundle-3');
  assert.equal(catalog.versions[0]?.isActive, true);
});

test('only accepts a quote when draft, active catalog, and quote snapshot versions match', () => {
  assert.equal(isQuotePromptVersionCurrent('bundle-2', 'bundle-2', 'bundle-2'), true);
  assert.equal(isQuotePromptVersionCurrent('bundle-1', 'bundle-2', 'bundle-1'), false);
  assert.equal(isQuotePromptVersionCurrent('bundle-2', 'bundle-2', null), false);
});

test('only performs structured prompt refresh for the explicit quote conflict', () => {
  assert.equal(shouldRefreshPromptVersionAfterQuoteError(409, 'PROMPT_VERSION_CHANGED'), true);
  assert.equal(shouldRefreshPromptVersionAfterQuoteError(400, 'PROMPT_VERSION_CHANGED'), false);
  assert.equal(shouldRefreshPromptVersionAfterQuoteError(409, 'QUOTE_EXPIRED'), false);
  assert.equal(canAttemptPromptVersionRecovery(0), true);
  assert.equal(canAttemptPromptVersionRecovery(1), false);
  assert.equal(canAttemptPromptVersionRecovery(2), false);
});

test('extracts repeated placeholders once without treating repetition as malformed', () => {
  assert.deepEqual(
    extractPromptTokens('{{cta}} 다음 {{cta}} 그리고 {{visual_mode}}'),
    ['cta', 'visual_mode'],
  );
  const creative = PROMPT_TEMPLATE_DEFINITIONS.find(
    (definition) => definition.key === 'creative_brief',
  );
  assert.ok(creative);
  assert.equal(
    validatePromptTemplate(
      creative,
      '{{advertising_purpose}} {{cta}} {{cta}} {{visual_mode}}',
    ).valid,
    true,
  );
});

test('requires canonical tokens and rejects unknown or malformed placeholders', () => {
  const script = PROMPT_TEMPLATE_DEFINITIONS.find(
    (definition) => definition.key === 'script_generation',
  );
  assert.ok(script);
  const result = validatePromptTemplate(
    script,
    '{{product_context}} {{creative_brief}} {{made_up}} {{template_scene_plan',
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('허용되지 않은 토큰')));
  assert.ok(result.errors.some((error) => error.includes('형식으로 완결')));
});

test('validates all six prompt templates as one immutable bundle', () => {
  assert.equal(validatePromptTemplates(validTemplates()).valid, true);
  assert.equal(
    validatePromptTemplates({ ...validTemplates(), video_base: '장면 지시만 있음' }).valid,
    false,
  );
});

test('matches the backend seed token contract per template', () => {
  const templates = {
    ...validTemplates(),
    script_generation:
      '{{product_context}} {{creative_brief}} {{template_scene_plan}} {{channel}} {{target_audience}} {{duration_seconds}} {{resolution}} {{aspect_ratio}} {{visual_mode}} {{retry_instruction}}',
    script_tts_repair:
      '{{retry_error}} {{duration_seconds}} {{channel}} {{target_audience}} {{visual_mode}}',
    video_base:
      '{{script_visual_table}} {{duration_seconds}} {{resolution}} {{aspect_ratio}} {{visual_mode}}',
    video_identity_reference:
      '{{duration_seconds}} {{resolution}} {{aspect_ratio}} {{visual_mode}}',
    video_generated_model:
      '{{duration_seconds}} {{resolution}} {{aspect_ratio}} {{visual_mode}}',
    creative_brief:
      '{{advertising_purpose}} {{cta}} {{visual_mode}} {{must_include}} {{must_exclude}} {{extra_details}} {{channel}} {{target_audience}} {{duration_seconds}}',
  };

  assert.equal(validatePromptTemplates(templates).valid, true);
});

test('accepts the actual bundled backend prompt defaults', () => {
  const templates = emptyPromptTemplates();
  for (const definition of PROMPT_TEMPLATE_DEFINITIONS) {
    templates[definition.key] = readFileSync(
      new URL(`../../backend/app/prompt_defaults/${definition.key}.txt`, import.meta.url),
      'utf8',
    );
  }

  assert.equal(validatePromptTemplates(templates).valid, true);
});

test('counts Korean text in UTF-8 bytes and enforces the 64KiB boundary', () => {
  assert.equal(utf8ByteLength('한'), 3);
  const script = PROMPT_TEMPLATE_DEFINITIONS.find(
    (definition) => definition.key === 'script_generation',
  );
  assert.ok(script);
  const base = '{{product_context}} {{creative_brief}} {{template_scene_plan}} ';
  const remaining = MAX_PROMPT_TEMPLATE_BYTES - utf8ByteLength(base);
  const exact = `${base}${'가'.repeat(Math.floor(remaining / 3))}${'a'.repeat(remaining % 3)}`;
  assert.equal(utf8ByteLength(exact), MAX_PROMPT_TEMPLATE_BYTES);
  assert.equal(validatePromptTemplate(script, exact).valid, true);
  assert.equal(validatePromptTemplate(script, `${exact}한`).valid, false);
});

test('rejects a bundle over 256KiB even when every template is under 64KiB', () => {
  const templates = validTemplates();
  for (const definition of PROMPT_TEMPLATE_DEFINITIONS) {
    templates[definition.key] = `${templates[definition.key]}${'한'.repeat(15_000)}`;
  }
  const result = validatePromptTemplates(templates);
  assert.equal(Object.values(result.byKey).every((item) => item.valid), true);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('256KiB')));
});

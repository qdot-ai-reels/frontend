'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  PROMPT_TEMPLATE_DEFINITIONS,
  emptyPromptTemplates,
  utf8ByteLength,
  validatePromptTemplates,
} from '@/lib/prompt-versions';
import { studioApi } from '@/lib/studio-api';
import type {
  PromptTemplateKey,
  PromptTemplates,
  PromptVersion,
  PromptVersionCatalog,
} from '@/types/studio';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

function cloneTemplates(templates: PromptTemplates): PromptTemplates {
  return { ...templates };
}

function formatDate(value: string | null): string {
  if (!value) return '기록 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '기록 없음'
    : new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function sortVersions(versions: PromptVersion[]): PromptVersion[] {
  return [...versions].sort((left, right) => {
    const numeric = Number(right.version) - Number(left.version);
    if (Number.isFinite(numeric) && numeric !== 0) return numeric;
    return (right.createdAt ?? '').localeCompare(left.createdAt ?? '');
  });
}

const PROMPT_DRAFT_STORAGE_KEY = 'quedot.prompt-settings.draft.v1';

type StoredPromptDraft = {
  selectedId: string;
  templates: PromptTemplates;
  versionName: string;
  changeNote: string;
};

function readStoredPromptDraft(): StoredPromptDraft | null {
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(PROMPT_DRAFT_STORAGE_KEY) ?? 'null',
    );
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<StoredPromptDraft>;
    if (
      typeof candidate.selectedId !== 'string' ||
      typeof candidate.versionName !== 'string' ||
      typeof candidate.changeNote !== 'string' ||
      !candidate.templates ||
      !PROMPT_TEMPLATE_DEFINITIONS.every(
        ({ key }) => typeof candidate.templates?.[key] === 'string',
      )
    ) return null;
    return candidate as StoredPromptDraft;
  } catch {
    return null;
  }
}

function discardStoredPromptDraft() {
  try {
    window.sessionStorage.removeItem(PROMPT_DRAFT_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function persistStoredPromptDraft(draft: StoredPromptDraft): boolean {
  try {
    window.sessionStorage.setItem(PROMPT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function PromptSettings() {
  const [catalog, setCatalog] = useState<PromptVersionCatalog>({
    activeBundleId: null,
    versions: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<PromptTemplates>(emptyPromptTemplates);
  const [versionName, setVersionName] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationTargetId, setActivationTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const savingRef = useRef(false);
  const activatingRef = useRef(false);
  const catalogRequestRef = useRef(0);
  const draftRestoreHandledRef = useRef(false);
  const latestDraftRef = useRef<StoredPromptDraft | null>(null);
  const activationTriggerRef = useRef<HTMLButtonElement>(null);
  const activationCancelRef = useRef<HTMLButtonElement>(null);
  const activationConfirmRef = useRef<HTMLButtonElement>(null);
  const activationDialogRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => catalog.versions.find((version) => version.id === selectedId) ?? null,
    [catalog.versions, selectedId],
  );
  const active = useMemo(
    () =>
      catalog.versions.find(
        (version) => version.isActive || version.id === catalog.activeBundleId,
      ) ?? null,
    [catalog],
  );
  const validation = useMemo(() => validatePromptTemplates(templates), [templates]);
  const changedKeys = useMemo(
    () =>
      PROMPT_TEMPLATE_DEFINITIONS.filter(
        (definition) =>
          templates[definition.key] !== (selected?.templates[definition.key] ?? ''),
      ).map((definition) => definition.key),
    [selected, templates],
  );
  const hasUnsavedChanges = Boolean(
    selected && (
      changedKeys.length > 0 ||
      versionName !== selected.name ||
      changeNote.length > 0
    ),
  );
  const shouldGuardNavigation = hasUnsavedChanges || saving || activating;
  const changedFromActiveKeys = useMemo(
    () =>
      PROMPT_TEMPLATE_DEFINITIONS.filter(
        (definition) => templates[definition.key] !== (active?.templates[definition.key] ?? ''),
      ).map((definition) => definition.key),
    [active, templates],
  );

  const applySelection = useCallback((version: PromptVersion) => {
    setSelectedId(version.id);
    setTemplates(cloneTemplates(version.templates));
    setVersionName(version.name);
    setChangeNote('');
    setActivationTargetId(null);
  }, []);

  const loadCatalog = useCallback(async (preferredId?: string) => {
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const nextCatalog = await studioApi.getPromptVersions();
      if (requestId !== catalogRequestRef.current) return;
      const versions = sortVersions(nextCatalog.versions);
      const normalizedCatalog = { ...nextCatalog, versions };
      setCatalog(normalizedCatalog);
      const nextSelected =
        versions.find((version) => version.id === preferredId) ??
        versions.find(
          (version) => version.isActive || version.id === normalizedCatalog.activeBundleId,
        ) ??
        versions[0];
      const storedDraft = draftRestoreHandledRef.current ? null : readStoredPromptDraft();
      draftRestoreHandledRef.current = true;
      const draftBase = storedDraft
        ? versions.find((version) => version.id === storedDraft.selectedId)
        : null;
      if (
        storedDraft &&
        draftBase &&
        window.confirm('이전에 저장하지 못한 프롬프트 편집본이 있습니다. 이어서 편집할까요?')
      ) {
        setSelectedId(draftBase.id);
        setTemplates(cloneTemplates(storedDraft.templates));
        setVersionName(storedDraft.versionName);
        setChangeNote(storedDraft.changeNote);
        setActivationTargetId(null);
      } else if (nextSelected) {
        if (storedDraft) discardStoredPromptDraft();
        applySelection(nextSelected);
      } else {
        setSelectedId(null);
        setTemplates(emptyPromptTemplates());
        setVersionName('');
      }
    } catch (nextError) {
      if (requestId === catalogRequestRef.current) setError(messageOf(nextError));
    } finally {
      if (requestId === catalogRequestRef.current) setLoading(false);
    }
  }, [applySelection]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCatalog(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCatalog]);

  useEffect(() => {
    if (!selectedId) return;
    if (!hasUnsavedChanges) {
      latestDraftRef.current = null;
      discardStoredPromptDraft();
      return;
    }
    const draft = { selectedId, templates, versionName, changeNote };
    latestDraftRef.current = draft;
    const timer = window.setTimeout(() => {
      if (!persistStoredPromptDraft(draft)) {
        setError('브라우저 임시 저장을 사용할 수 없습니다. 이 페이지에서 새 버전 저장을 완료해 주세요.');
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [changeNote, hasUnsavedChanges, selectedId, templates, versionName]);

  useEffect(() => {
    if (!shouldGuardNavigation) return;

    const confirmMessage =
      '저장하지 않은 프롬프트 변경이 있습니다. 변경을 버리고 페이지를 이동할까요?';
    const persistLatestDraft = () => {
      const draft = latestDraftRef.current;
      if (draft && !persistStoredPromptDraft(draft)) {
        setError('브라우저 임시 저장을 사용할 수 없습니다. 이 페이지에서 새 버전 저장을 완료해 주세요.');
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      persistLatestDraft();
      event.preventDefault();
      event.returnValue = '';
    };
    const handleLinkNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search
      ) return;
      if (savingRef.current || activatingRef.current) {
        persistLatestDraft();
        event.preventDefault();
        event.stopImmediatePropagation();
        setError('저장 또는 활성화가 완료된 뒤 페이지를 이동해 주세요.');
      } else if (!window.confirm(confirmMessage)) {
        persistLatestDraft();
        event.preventDefault();
        event.stopImmediatePropagation();
      } else {
        discardStoredPromptDraft();
      }
    };
    type NavigateEventLike = Event & {
      canIntercept?: boolean;
      navigationType?: string;
    };
    type WindowWithNavigation = Window & { navigation?: EventTarget };
    const navigation = (window as WindowWithNavigation).navigation;
    const handleHistoryNavigation = (event: Event) => {
      const navigateEvent = event as NavigateEventLike;
      if (navigateEvent.navigationType !== 'traverse') return;
      persistLatestDraft();
      if (!event.cancelable || navigateEvent.canIntercept === false) return;
      if (savingRef.current || activatingRef.current) {
        event.preventDefault();
        setError('저장 또는 활성화가 완료된 뒤 페이지를 이동해 주세요.');
      } else if (!window.confirm(confirmMessage)) {
        event.preventDefault();
      } else {
        discardStoredPromptDraft();
      }
    };

    const historyGuardKey = '__quedotPromptEditorGuard';
    const historyGuardId = window.crypto.randomUUID();
    let restoringHistoryGuard = false;
    let historyGuardActive = false;
    const handleGuardedPopState = () => {
      if (restoringHistoryGuard) {
        restoringHistoryGuard = false;
        return;
      }
      if (savingRef.current || activatingRef.current) {
        persistLatestDraft();
        restoringHistoryGuard = true;
        window.history.forward();
        setError('저장 또는 활성화가 완료된 뒤 페이지를 이동해 주세요.');
        return;
      }
      persistLatestDraft();
      if (window.confirm(confirmMessage)) {
        discardStoredPromptDraft();
        historyGuardActive = false;
        window.removeEventListener('popstate', handleGuardedPopState, true);
        window.history.back();
        return;
      }
      restoringHistoryGuard = true;
      window.history.forward();
    };

    if (navigation) {
      navigation.addEventListener('navigate', handleHistoryNavigation);
    } else {
      window.history.pushState(
        { ...window.history.state, [historyGuardKey]: historyGuardId },
        '',
        window.location.href,
      );
      historyGuardActive = true;
      window.addEventListener('popstate', handleGuardedPopState, true);
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleLinkNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkNavigation, true);
      navigation?.removeEventListener('navigate', handleHistoryNavigation);
      window.removeEventListener('popstate', handleGuardedPopState, true);
      if (
        historyGuardActive &&
        window.history.state?.[historyGuardKey] === historyGuardId
      ) {
        window.history.back();
      }
    };
  }, [shouldGuardNavigation]);

  useEffect(() => {
    if (!activationTargetId) return;
    if (activating) activationDialogRef.current?.focus();
    else activationCancelRef.current?.focus();
    const handleDialogKeyboard = (event: KeyboardEvent) => {
      if (activatingRef.current) {
        if (event.key === 'Escape' || event.key === 'Tab') event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActivationDialog();
        return;
      }
      if (event.key !== 'Tab') return;
      const first = activationCancelRef.current;
      const last = activationConfirmRef.current;
      if (!first || !last) return;
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || activeElement === null)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (activeElement !== first && activeElement !== last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKeyboard);
    return () => document.removeEventListener('keydown', handleDialogKeyboard);
  }, [activating, activationTargetId]);

  function selectVersion(version: PromptVersion) {
    if (savingRef.current || activatingRef.current) return;
    if (hasUnsavedChanges) {
      const discard = window.confirm(
        '저장하지 않은 프롬프트 변경이 있습니다. 변경을 버리고 다른 버전을 열까요?',
      );
      if (!discard) return;
      discardStoredPromptDraft();
    }
    setError(null);
    setNotice(null);
    applySelection(version);
  }

  function updateTemplate(key: PromptTemplateKey, content: string) {
    if (savingRef.current || activatingRef.current) return;
    setActivationTargetId(null);
    setTemplates((current) => ({ ...current, [key]: content }));
    setNotice(null);
  }

  function closeActivationDialog() {
    setActivationTargetId(null);
    window.requestAnimationFrame(() => activationTriggerRef.current?.focus());
  }

  function reloadCatalog() {
    if (
      hasUnsavedChanges &&
      !window.confirm(
        '저장하지 않은 프롬프트 변경이 있습니다. 변경을 버리고 서버 버전을 다시 불러올까요?',
      )
    ) return;
    discardStoredPromptDraft();
    void loadCatalog(selectedId ?? undefined);
  }

  async function saveVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      savingRef.current ||
      activatingRef.current ||
      !validation.valid ||
      changedKeys.length === 0
    ) return;
    if (!versionName.trim() || !changeNote.trim()) {
      setError('새 버전 이름과 변경 메모를 모두 입력해 주세요.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await studioApi.createPromptVersion({
        name: versionName.trim(),
        description: changeNote.trim(),
        templates,
      });
      setNotice(`${saved.name} · v${saved.version}을 불변 버전으로 저장했습니다.`);
      await loadCatalog(saved.id);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function activateVersion() {
    if (!activationTargetId || activatingRef.current || savingRef.current) return;
    if (hasUnsavedChanges) {
      setActivationTargetId(null);
      setError(
        '편집 중인 내용을 먼저 새 버전으로 저장한 뒤, 저장된 버전을 활성화해 주세요.',
      );
      return;
    }
    const targetId = activationTargetId;
    activatingRef.current = true;
    setActivating(true);
    setError(null);
    setNotice(null);
    try {
      await studioApi.activatePromptVersion(targetId);
      await loadCatalog(targetId);
      const target = catalog.versions.find((version) => version.id === targetId);
      setNotice(
        `${target?.name ?? '선택한 버전'}을 활성화했습니다. 지금부터 접수되는 신규 견적과 작업에만 적용됩니다.`,
      );
      setActivationTargetId(null);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      activatingRef.current = false;
      setActivating(false);
    }
  }

  if (loading && catalog.versions.length === 0) {
    return (
      <section className="route-state" aria-busy="true">
        <span className="state-symbol" aria-hidden="true">P</span>
        <h1>프롬프트 버전을 불러오는 중입니다</h1>
        <p>현재 활성 버전과 편집 가능한 원본을 확인하고 있습니다.</p>
      </section>
    );
  }

  return (
    <div className="page-stack prompt-settings-page">
      <header className="page-header-actions prompt-settings-header">
        <div className="page-header">
          <p className="eyebrow">PROMPT SETTINGS</p>
          <h1>프롬프트 버전 관리</h1>
          <p>
            실제 생성에 사용하는 지시문을 편집하고 불변 버전으로 저장한 뒤, 원하는 버전을
            활성화합니다. 활성화 변경은 진행 중인 작업에 영향을 주지 않습니다.
          </p>
        </div>
        <Link className="button button-secondary" href="/create">새 영상 만들기</Link>
      </header>

      {error && (
        <div className="inline-alert" role="alert">
          <span>{error}</span>
          <button
            type="button"
            disabled={saving || activating || loading}
            onClick={reloadCatalog}
          >
            다시 불러오기
          </button>
        </div>
      )}
      {notice && <div className="notice-banner success" role="status" aria-live="polite">{notice}</div>}

      <div className="prompt-settings-layout">
        <aside className="panel prompt-version-panel" aria-label="프롬프트 버전 목록">
          <div className="panel-heading compact">
            <div><h2>저장된 버전</h2><p>Published 버전은 수정되지 않습니다.</p></div>
          </div>
          {catalog.versions.length === 0 ? (
            <div className="prompt-empty">
              <strong>저장된 버전이 없습니다</strong>
              <p>서버에 초기 활성 프롬프트를 먼저 등록해 주세요.</p>
            </div>
          ) : (
            <div className="prompt-version-list">
              {catalog.versions.map((version) => {
                const isSelected = version.id === selectedId;
                return (
                  <button
                    type="button"
                    key={version.id}
                    className={isSelected ? 'selected' : ''}
                    aria-pressed={isSelected}
                    disabled={saving || activating}
                    onClick={() => selectVersion(version)}
                  >
                    <span>
                      <strong>{version.name}</strong>
                      {version.isActive && <em>활성</em>}
                    </span>
                    <small>v{version.version} · {formatDate(version.createdAt)}</small>
                    {version.description && <p>{version.description}</p>}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <form className="prompt-editor-stack" onSubmit={saveVersion}>
          <section className="panel prompt-release-panel">
            <div className="prompt-release-summary">
              <div>
                <span className="eyebrow">CURRENT RELEASE</span>
                <h2>{active ? `${active.name} · v${active.version}` : '활성 버전 없음'}</h2>
                <p>
                  {active?.contentSha256
                    ? `SHA-256 ${active.contentSha256.slice(0, 16)}…`
                    : '콘텐츠 해시 기록 없음'}
                </p>
              </div>
              {selected && !selected.isActive && (
                <button
                  ref={activationTriggerRef}
                  className="button button-secondary"
                  type="button"
                  disabled={saving || activating || hasUnsavedChanges}
                  onClick={() => setActivationTargetId(selected.id)}
                >
                  이 버전 활성화 준비
                </button>
              )}
              {selected?.isActive && <span className="live-badge"><i />현재 활성</span>}
            </div>
            <p className="prompt-release-policy">
              활성화는 이후 생성되는 신규 견적과 작업에만 적용됩니다. 이미 접수됐거나 처리 중인
              작업은 job에 저장된 기존 prompt version snapshot을 계속 사용합니다.
            </p>
            {selected && !selected.isActive && hasUnsavedChanges && (
              <p className="prompt-release-policy" role="status">
                편집본은 아직 저장된 버전이 아닙니다. 아래에서 새 버전으로 저장하면 활성화할 수 있습니다.
              </p>
            )}
            {activationTargetId && (
              <div
                ref={activationDialogRef}
                className="prompt-activation-confirm"
                role="alertdialog"
                aria-labelledby="activation-title"
                aria-describedby="activation-description"
                aria-busy={activating}
                tabIndex={-1}
              >
                <div>
                  <strong id="activation-title">활성 버전을 변경할까요?</strong>
                  <p id="activation-description">진행 중 작업은 유지되고, 신규 견적과 생성부터 선택 버전이 적용됩니다.</p>
                </div>
                <div className="inline-actions">
                  <button ref={activationCancelRef} className="button button-ghost" type="button" disabled={activating} onClick={closeActivationDialog}>취소</button>
                  <button ref={activationConfirmRef} className="button button-primary" type="button" disabled={saving || activating || hasUnsavedChanges} onClick={() => void activateVersion()}>
                    {activating ? '활성화 중…' : '신규 작업에 활성화'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {selected ? (
            <>
              <section className="panel prompt-meta-panel">
                <div className="panel-heading compact">
                  <div><h2>새 버전 정보</h2><p>열어 둔 버전을 원본으로 새 불변 버전을 만듭니다.</p></div>
                  <span className={changedKeys.length > 0 ? 'quiet-badge changed' : 'quiet-badge'}>
                    {changedKeys.length > 0 ? `${changedKeys.length}개 템플릿 변경` : '원본과 동일'}
                  </span>
                </div>
                <div className="form-grid">
                  <label className="form-field">
                    <span>버전 이름</span>
                    <input
                      value={versionName}
                      maxLength={120}
                      disabled={saving || activating}
                      onChange={(event) => setVersionName(event.target.value)}
                      placeholder="예: 한국어 자연 발화 개선"
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>변경 메모</span>
                    <input
                      value={changeNote}
                      maxLength={500}
                      disabled={saving || activating}
                      onChange={(event) => setChangeNote(event.target.value)}
                      placeholder="무엇을 왜 바꿨는지 기록"
                      required
                    />
                  </label>
                </div>
                <p className="prompt-diff-summary">
                  활성 버전 대비 {changedFromActiveKeys.length}개 템플릿이 다릅니다. 저장만으로는
                  활성화되지 않습니다.
                </p>
                <p className="prompt-diff-summary">
                  번들 용량 {(validation.totalBytes / 1024).toFixed(1)} / 256 KiB (UTF-8)
                </p>
                {validation.errors.length > 0 && (
                  <ul className="prompt-validation-errors" role="alert">
                    {validation.errors.map((validationError) => (
                      <li key={validationError}>{validationError}</li>
                    ))}
                  </ul>
                )}
              </section>

              {PROMPT_TEMPLATE_DEFINITIONS.map((definition) => {
                const result = validation.byKey[definition.key];
                const changed = changedKeys.includes(definition.key);
                const changedFromActive = changedFromActiveKeys.includes(definition.key);
                return (
                  <section className="panel prompt-template-panel" key={definition.key}>
                    <div className="panel-heading compact">
                      <div>
                        <span className="prompt-template-key">{definition.key}</span>
                        <h2>{definition.label}</h2>
                        <p>{definition.description}</p>
                      </div>
                      <div className="prompt-template-status">
                        {changed && <span className="quiet-badge changed">원본에서 변경</span>}
                        {changedFromActive && <span className="quiet-badge">활성과 다름</span>}
                      </div>
                    </div>
                    <label className="prompt-textarea-label" htmlFor={`prompt-${definition.key}`}>
                      프롬프트 템플릿
                    </label>
                    <textarea
                      id={`prompt-${definition.key}`}
                      className="prompt-textarea"
                      value={templates[definition.key]}
                      disabled={saving || activating}
                      onChange={(event) => updateTemplate(definition.key, event.target.value)}
                      spellCheck={false}
                      aria-invalid={!result.valid}
                      aria-describedby={`prompt-help-${definition.key}`}
                    />
                    <div className="prompt-editor-meta" id={`prompt-help-${definition.key}`}>
                      <span>{templates[definition.key].length.toLocaleString('ko-KR')}자</span>
                      <span>{(utf8ByteLength(templates[definition.key]) / 1024).toFixed(1)} / 64 KiB</span>
                      <span>사용 토큰 {result.tokens.length}개</span>
                    </div>
                    <div className="prompt-token-help">
                      <div>
                        <strong>필수 토큰</strong>
                        <span>{definition.requiredTokens.length > 0 ? definition.requiredTokens.map((token) => `{{${token}}}`).join(' ') : '없음'}</span>
                      </div>
                      <details>
                        <summary>허용 토큰 보기</summary>
                        <p>{definition.allowedTokens.map((token) => `{{${token}}}`).join(' ')}</p>
                      </details>
                    </div>
                    {result.errors.length > 0 && (
                      <ul className="prompt-validation-errors" role="alert">
                        {result.errors.map((validationError) => <li key={validationError}>{validationError}</li>)}
                      </ul>
                    )}
                  </section>
                );
              })}

              <div className="prompt-save-bar">
                <div>
                  <strong>{validation.valid ? '토큰 검증 완료' : '저장 전 오류를 수정해 주세요'}</strong>
                  <p>미리보기나 provider 테스트는 실행하지 않으며, 저장 후 별도로 활성화합니다.</p>
                </div>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={saving || activating || !validation.valid || changedKeys.length === 0}
                >
                  {saving ? '새 버전 저장 중…' : '새 버전으로 저장'}
                </button>
              </div>
            </>
          ) : (
            <section className="panel prompt-empty editor-empty">
              <strong>편집할 원본 버전이 없습니다</strong>
              <p>서버 bootstrap이 완료되면 새 버전을 만들 수 있습니다.</p>
            </section>
          )}
        </form>
      </div>
    </div>
  );
}

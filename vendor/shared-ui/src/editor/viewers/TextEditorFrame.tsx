"use client";

import { Code2, Eye } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { EditorSaveButton, type SaveStatus } from "../EditorSaveButton";
import { PlainTextEditor } from "../PlainTextEditor";
import type { EditorMode, EditorSaveMode } from "../viewerTypes";

type ModeTogglePlacement = "bottom" | "top";

export type TextEditorFrameProps = {
  documentId: string;
  content: string;
  nodeName: string;
  defaultMode: EditorMode;
  canEdit: boolean;
  onSaveContent?: (content: string) => Promise<void>;
  hideSourceView: boolean;
  saveMode: EditorSaveMode;
  modeTogglePlacement?: ModeTogglePlacement;
  liveModeLabel?: string;
  sourceModeLabel?: string;
  renderLive: (
    content: string,
    controls: { canEdit: boolean; onChange: (content: string) => void; editSourceAtLine: (lineNumber: number) => void },
  ) => ReactNode;
  renderSource?: (
    content: string,
    controls: { canEdit: boolean; onChange: (content: string) => void; focusLine: number | null },
  ) => ReactNode;
};

export function TextEditorFrame({
  documentId,
  content,
  nodeName,
  defaultMode,
  canEdit,
  onSaveContent,
  hideSourceView,
  saveMode,
  modeTogglePlacement = "bottom",
  liveModeLabel = "Preview",
  sourceModeLabel = "Source code",
  renderLive,
  renderSource,
}: TextEditorFrameProps) {
  const [mode, setMode] = useState<EditorMode>(hideSourceView ? "live" : defaultMode);
  const [draft, setDraft] = useState(content);
  const [persistedContent, setPersistedContent] = useState(content);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("clean");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sourceFocusLine, setSourceFocusLine] = useState<number | null>(null);
  const documentIdRef = useRef(documentId);
  const draftRef = useRef(draft);
  const persistedContentRef = useRef(persistedContent);
  const savingRef = useRef(false);
  const queuedAutoSaveRef = useRef<string | null>(null);
  const dirty = draft !== persistedContent;

  useLayoutEffect(() => {
    if (documentIdRef.current === documentId) return;

    documentIdRef.current = documentId;
    savingRef.current = false;
    queuedAutoSaveRef.current = null;
    draftRef.current = content;
    persistedContentRef.current = content;
    setMode(hideSourceView ? "live" : defaultMode);
    setDraft(content);
    setPersistedContent(content);
    setSaveStatus("clean");
    setSaveError(null);
    setSourceFocusLine(null);
  }, [content, defaultMode, documentId, hideSourceView]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    persistedContentRef.current = persistedContent;
  }, [persistedContent]);

  useLayoutEffect(() => {
    if (documentIdRef.current !== documentId) return;

    const previousPersistedContent = persistedContentRef.current;
    const hasLocalDraft = saveMode === "auto" &&
      draftRef.current !== previousPersistedContent &&
      draftRef.current !== content;

    setPersistedContent(content);
    persistedContentRef.current = content;
    setSaveError(null);

    if (hasLocalDraft) {
      setSaveStatus("dirty");
      return;
    }

    setDraft(content);
    draftRef.current = content;
    setSaveStatus("clean");
  }, [content, documentId, saveMode]);

  useEffect(() => {
    if (hideSourceView) setMode("live");
  }, [hideSourceView]);

  useEffect(() => {
    if (dirty) setSaveStatus((status) => (status === "saving" ? status : "dirty"));
    else if (saveStatus === "dirty" || saveStatus === "error") setSaveStatus("clean");
  }, [dirty, saveStatus]);

  const saveContent = async (contentToSave: string, automatic: boolean) => {
    if (!onSaveContent || contentToSave === persistedContentRef.current) return;

    if (savingRef.current) {
      if (automatic) queuedAutoSaveRef.current = contentToSave;
      return;
    }

    const saveDocumentId = documentIdRef.current;
    savingRef.current = true;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await onSaveContent(contentToSave);
      if (documentIdRef.current !== saveDocumentId) return;

      persistedContentRef.current = contentToSave;
      setPersistedContent(contentToSave);
      setSaveStatus(draftRef.current === contentToSave ? "saved" : "dirty");
      window.setTimeout(() => {
        if (documentIdRef.current !== saveDocumentId) return;
        setSaveStatus((status) => (status === "saved" ? "clean" : status));
      }, 1200);
    } catch (error) {
      if (documentIdRef.current !== saveDocumentId) return;
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      if (documentIdRef.current !== saveDocumentId) return;

      savingRef.current = false;
      if (automatic) {
        const queuedContent = queuedAutoSaveRef.current;
        queuedAutoSaveRef.current = null;
        if (queuedContent !== null && queuedContent !== persistedContentRef.current) {
          window.setTimeout(() => {
            void saveContent(draftRef.current, true);
          }, 0);
        }
      }
    }
  };

  const save = () => {
    void saveContent(draftRef.current, false);
  };

  const editSourceAtLine = (lineNumber: number) => {
    setSourceFocusLine(Number.isFinite(lineNumber) ? Math.max(1, Math.round(lineNumber)) : 1);
    setMode("source");
  };

  useEffect(() => {
    if (saveMode !== "auto" || !dirty || !onSaveContent) return undefined;

    const timeoutId = window.setTimeout(() => {
      void saveContent(draftRef.current, true);
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [dirty, draft, onSaveContent, saveMode]);

  return (
    <section
      className="editor-host"
      data-mode-toggle-placement={!hideSourceView ? modeTogglePlacement : undefined}
    >
      {saveMode === "manual" && (
        <div className="editor-save-overlay">
          <EditorSaveButton status={saveStatus} onSave={save} />
        </div>
      )}

      {saveError && <div className="editor-inline-error">{saveError}</div>}

      {mode === "live" ? (
        <div className="editor-live-surface">
          {renderLive(draft, { canEdit, onChange: setDraft, editSourceAtLine })}
        </div>
      ) : renderSource ? (
        <div className="editor-live-surface">
          {renderSource(draft, { canEdit, onChange: setDraft, focusLine: sourceFocusLine })}
        </div>
      ) : (
        <PlainTextEditor
          content={draft}
          nodeName={nodeName}
          readOnly={!canEdit}
          onChange={canEdit ? setDraft : undefined}
        />
      )}

      {!hideSourceView && (
        <div className="editor-mode-toggle" data-placement={modeTogglePlacement} aria-label="Editor mode">
          <button
            className={mode === "live" ? "active" : ""}
            type="button"
            onClick={() => setMode("live")}
            title={liveModeLabel}
            aria-label={liveModeLabel}
            aria-pressed={mode === "live"}
          >
            <Eye size={14} strokeWidth={2} />
          </button>
          <button
            className={mode === "source" ? "active" : ""}
            type="button"
            onClick={() => setMode("source")}
            title={sourceModeLabel}
            aria-label={sourceModeLabel}
            aria-pressed={mode === "source"}
          >
            <Code2 size={14} strokeWidth={2} />
          </button>
        </div>
      )}
    </section>
  );
}

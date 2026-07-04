"use client";

import { MarkdownDocumentPreview } from "../markdown/MarkdownDocumentPreview";
import { MarkdownCodeMirrorEditor } from "../markdown/MarkdownCodeMirrorEditor";
import type { EditorViewerContext } from "../viewerTypes";
import { TextEditorFrame } from "./TextEditorFrame";

export function MarkdownViewer(context: EditorViewerContext) {
  return (
    <TextEditorFrame
      documentId={context.document.path}
      content={context.content}
      nodeName={context.document.name}
      defaultMode="live"
      canEdit={context.canEdit}
      onSaveContent={context.onSaveContent}
      hideSourceView={false}
      saveMode={context.saveMode}
      modeTogglePlacement="top"
      liveModeLabel="Rendered preview"
      sourceModeLabel="Markdown source"
      renderLive={(value, controls) => (
        <MarkdownDocumentPreview
          value={value}
          htmlTrustMode={context.htmlTrustMode}
          documentPath={context.document.path}
          markdownLinkGraph={context.markdownLinkGraph}
          markdownAssetUrlResolver={context.markdownAssetUrlResolver}
          onEditLine={context.canEdit ? controls.editSourceAtLine : undefined}
        />
      )}
      renderSource={(value, controls) => (
        <MarkdownCodeMirrorEditor
          value={value}
          readOnly={!controls.canEdit}
          livePreview={false}
          focusLine={controls.focusLine}
          aiEditFile={context.aiEditFile}
          htmlTrustMode={context.htmlTrustMode}
          documentPath={context.document.path}
          markdownLinkGraph={context.markdownLinkGraph}
          markdownAssetUrlResolver={context.markdownAssetUrlResolver}
          onChange={controls.canEdit ? controls.onChange : undefined}
        />
      )}
    />
  );
}

export function canEditMarkdown() {
  return true;
}

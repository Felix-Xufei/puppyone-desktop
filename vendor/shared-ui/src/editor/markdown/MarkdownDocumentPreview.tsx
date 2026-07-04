"use client";

import { useLayoutEffect, useRef } from "react";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../viewerTypes";
import { renderMarkdownInlineInto } from "./rendering/inlineRenderer";
import { createSanitizedBlockHtmlFragment } from "./rendering/sanitizeHtml";

export type MarkdownDocumentPreviewProps = {
  value: string;
  htmlTrustMode?: MarkdownHtmlTrustMode;
  documentPath?: string;
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  onEditLine?: (lineNumber: number) => void;
};

type RenderContext = {
  htmlTrustMode: MarkdownHtmlTrustMode;
  documentPath: string;
  markdownLinkGraph: MarkdownLinkGraph | null;
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null;
  onEditLine: ((lineNumber: number) => void) | null;
};

type MarkdownLine = {
  text: string;
  index: number;
};

export function MarkdownDocumentPreview({
  value,
  htmlTrustMode = "safe",
  documentPath = "",
  markdownLinkGraph = null,
  markdownAssetUrlResolver = null,
  onEditLine,
}: MarkdownDocumentPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.replaceChildren();
    renderMarkdownDocument(host, value, {
      htmlTrustMode,
      documentPath,
      markdownLinkGraph,
      markdownAssetUrlResolver,
      onEditLine: onEditLine ?? null,
    });
  }, [documentPath, htmlTrustMode, markdownAssetUrlResolver, markdownLinkGraph, onEditLine, value]);

  return (
    <div className="markdown-document-preview">
      <article ref={hostRef} className="markdown-document-preview__page" />
    </div>
  );
}

function renderMarkdownDocument(target: HTMLElement, source: string, context: RenderContext) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let cursor = 0;
  let renderedBlocks = 0;

  while (cursor < lines.length) {
    const line = { text: lines[cursor], index: cursor };
    if (isBlank(line.text)) {
      cursor += 1;
      continue;
    }

    const codeBlock = readCodeBlock(lines, cursor);
    if (codeBlock) {
      appendCodeBlock(target, codeBlock.language, codeBlock.code, cursor, context);
      cursor = codeBlock.nextCursor;
      renderedBlocks += 1;
      continue;
    }

    const tableBlock = readTableBlock(lines, cursor);
    if (tableBlock) {
      appendTable(target, tableBlock.rows, cursor, context);
      cursor = tableBlock.nextCursor;
      renderedBlocks += 1;
      continue;
    }

    const htmlBlock = readHtmlBlock(lines, cursor);
    if (htmlBlock) {
      appendHtmlBlock(target, htmlBlock.source, cursor, context);
      cursor = htmlBlock.nextCursor;
      renderedBlocks += 1;
      continue;
    }

    const hrMatch = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.exec(line.text);
    if (hrMatch) {
      appendEditableBlock(target, document.createElement("hr"), cursor, context);
      cursor += 1;
      renderedBlocks += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})(?:\s+|$)(.*)$/.exec(line.text);
    if (headingMatch) {
      appendHeading(target, headingMatch[1].length, headingMatch[2], cursor, context);
      cursor += 1;
      renderedBlocks += 1;
      continue;
    }

    const blockquote = readBlockquote(lines, cursor);
    if (blockquote) {
      appendBlockquote(target, blockquote.lines, cursor, context);
      cursor = blockquote.nextCursor;
      renderedBlocks += 1;
      continue;
    }

    const listBlock = readListBlock(lines, cursor);
    if (listBlock) {
      appendList(target, listBlock.items, cursor, context);
      cursor = listBlock.nextCursor;
      renderedBlocks += 1;
      continue;
    }

    const paragraph = readParagraph(lines, cursor);
    appendParagraph(target, paragraph.lines, cursor, context);
    cursor = paragraph.nextCursor;
    renderedBlocks += 1;
  }

  if (renderedBlocks === 0) {
    const empty = document.createElement("div");
    empty.className = "markdown-document-preview__empty";
    empty.textContent = "Empty Markdown document";
    target.appendChild(empty);
  }
}

function appendHeading(target: HTMLElement, depth: number, text: string, sourceLine: number, context: RenderContext) {
  const heading = document.createElement(`h${Math.min(Math.max(depth, 1), 6)}`);
  renderInline(heading, text.trim(), context);
  appendEditableBlock(target, heading, sourceLine, context);
}

function appendParagraph(target: HTMLElement, lines: MarkdownLine[], sourceLine: number, context: RenderContext) {
  const paragraph = document.createElement("p");
  renderInline(paragraph, joinParagraphLines(lines), context);
  appendEditableBlock(target, paragraph, lines[0]?.index ?? sourceLine, context);
}

function appendBlockquote(target: HTMLElement, lines: MarkdownLine[], sourceLine: number, context: RenderContext) {
  const blockquote = document.createElement("blockquote");
  const paragraphGroups = splitBlankSeparatedLines(lines);

  for (const group of paragraphGroups) {
    const paragraph = document.createElement("p");
    renderInline(paragraph, joinParagraphLines(group), context);
    blockquote.appendChild(paragraph);
  }

  appendEditableBlock(target, blockquote, lines[0]?.index ?? sourceLine, context);
}

function appendList(target: HTMLElement, items: ListItem[], sourceLine: number, context: RenderContext) {
  const ordered = items[0]?.ordered ?? false;
  const list = document.createElement(ordered ? "ol" : "ul");

  for (const item of items) {
    const element = document.createElement("li");
    if (item.depth > 0) element.style.marginLeft = `${Math.min(item.depth, 6) * 18}px`;

    if (item.task) {
      element.className = item.task.checked ? "markdown-document-preview__task is-checked" : "markdown-document-preview__task";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.task.checked;
      checkbox.disabled = true;
      element.appendChild(checkbox);

      const label = document.createElement("span");
      renderInline(label, item.task.text, context);
      element.appendChild(label);
    } else {
      renderInline(element, item.text, context);
    }

    list.appendChild(element);
  }

  appendEditableBlock(target, list, sourceLine, context);
}

function appendCodeBlock(target: HTMLElement, language: string, codeText: string, sourceLine: number, context: RenderContext) {
  const wrapper = document.createElement("div");
  wrapper.className = "markdown-document-preview__code-block";

  if (language) {
    const label = document.createElement("div");
    label.className = "markdown-document-preview__code-language";
    label.textContent = language;
    wrapper.appendChild(label);
  }

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = codeText;
  pre.appendChild(code);
  wrapper.appendChild(pre);
  appendEditableBlock(target, wrapper, sourceLine, context);
}

function appendTable(target: HTMLElement, rows: string[][], sourceLine: number, context: RenderContext) {
  const wrapper = document.createElement("div");
  wrapper.className = "markdown-document-preview__table-wrap";
  const table = document.createElement("table");

  rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const cellElement = document.createElement(rowIndex === 0 ? "th" : "td");
      renderInline(cellElement, cell, context);
      tr.appendChild(cellElement);
    });
    table.appendChild(tr);
  });

  wrapper.appendChild(table);
  appendEditableBlock(target, wrapper, sourceLine, context);
}

function appendHtmlBlock(target: HTMLElement, source: string, sourceLine: number, context: RenderContext) {
  const wrapper = document.createElement("div");
  wrapper.className = "markdown-document-preview__html-block";

  const sanitized = createSanitizedBlockHtmlFragment(source);
  if (context.htmlTrustMode === "safe" && !sanitized.supported) {
    appendCodeBlock(target, "html", source, sourceLine, context);
    return;
  }

  wrapper.appendChild(sanitized.fragment);
  appendEditableBlock(target, wrapper, sourceLine, context);
}

function appendEditableBlock(target: HTMLElement, element: HTMLElement, sourceLine: number, context: RenderContext) {
  if (!context.onEditLine) {
    target.appendChild(element);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "markdown-document-preview__editable-block";
  wrapper.dataset.sourceLine = String(sourceLine + 1);
  wrapper.appendChild(element);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "markdown-document-preview__edit-button";
  button.title = `Edit line ${sourceLine + 1}`;
  button.setAttribute("aria-label", `Edit line ${sourceLine + 1}`);
  button.textContent = "Edit";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    context.onEditLine?.(sourceLine + 1);
  });
  wrapper.appendChild(button);
  target.appendChild(wrapper);
}

function renderInline(target: Node, source: string, context: RenderContext) {
  renderMarkdownInlineInto(target, source, {
    markdownLinkGraph: context.markdownLinkGraph,
    markdownAssetUrlResolver: context.markdownAssetUrlResolver,
    sourcePath: context.documentPath,
  });
}

function readCodeBlock(lines: string[], cursor: number): { language: string; code: string; nextCursor: number } | null {
  const match = /^\s{0,3}(`{3,}|~{3,})\s*([^`]*)$/.exec(lines[cursor]);
  if (!match) return null;

  const fence = match[1][0];
  const fenceLength = match[1].length;
  const language = match[2].trim();
  const codeLines: string[] = [];
  let nextCursor = cursor + 1;

  while (nextCursor < lines.length) {
    const line = lines[nextCursor];
    if (new RegExp(`^\\s{0,3}${escapeRegExp(fence)}{${fenceLength},}\\s*$`).test(line)) {
      nextCursor += 1;
      break;
    }
    codeLines.push(line);
    nextCursor += 1;
  }

  return {
    language,
    code: codeLines.join("\n"),
    nextCursor,
  };
}

function readTableBlock(lines: string[], cursor: number): { rows: string[][]; nextCursor: number } | null {
  if (cursor + 1 >= lines.length) return null;
  if (!isTableHeaderLine(lines[cursor]) || !isTableDelimiterLine(lines[cursor + 1])) return null;

  const rows = [splitTableCells(lines[cursor])];
  let nextCursor = cursor + 2;

  while (nextCursor < lines.length && isMarkdownTableLine(lines[nextCursor]) && !isTableDelimiterLine(lines[nextCursor])) {
    rows.push(splitTableCells(lines[nextCursor]));
    nextCursor += 1;
  }

  const width = Math.max(...rows.map((row) => row.length));
  return {
    rows: rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? "")),
    nextCursor,
  };
}

function readHtmlBlock(lines: string[], cursor: number): { source: string; nextCursor: number } | null {
  const firstLine = lines[cursor];
  const tagMatch = /^\s{0,3}<([a-z][a-z0-9-]*)(?:\s|>|\/>)/i.exec(firstLine);
  if (!tagMatch) return null;

  const tagName = tagMatch[1].toLowerCase();
  const sourceLines = [firstLine];
  let nextCursor = cursor + 1;
  if (isVoidHtmlTag(tagName) || firstLine.includes(`</${tagName}>`) || /\/>\s*$/.test(firstLine)) {
    return { source: sourceLines.join("\n"), nextCursor };
  }

  while (nextCursor < lines.length) {
    sourceLines.push(lines[nextCursor]);
    if (lines[nextCursor].toLowerCase().includes(`</${tagName}>`)) {
      nextCursor += 1;
      break;
    }
    nextCursor += 1;
  }

  return {
    source: sourceLines.join("\n"),
    nextCursor,
  };
}

function readBlockquote(lines: string[], cursor: number): { lines: MarkdownLine[]; nextCursor: number } | null {
  if (!/^\s*>/.test(lines[cursor])) return null;

  const blockLines: MarkdownLine[] = [];
  let nextCursor = cursor;
  while (nextCursor < lines.length) {
    const line = lines[nextCursor];
    if (!/^\s*>/.test(line) && !isBlank(line)) break;
    blockLines.push({
      text: line.replace(/^\s*>\s?/, ""),
      index: nextCursor,
    });
    nextCursor += 1;
  }

  return { lines: blockLines, nextCursor };
}

type ListItem = {
  text: string;
  depth: number;
  ordered: boolean;
  task: { checked: boolean; text: string } | null;
};

function readListBlock(lines: string[], cursor: number): { items: ListItem[]; nextCursor: number } | null {
  const firstItem = parseListItem(lines[cursor]);
  if (!firstItem) return null;

  const items: ListItem[] = [];
  let nextCursor = cursor;

  while (nextCursor < lines.length) {
    const item = parseListItem(lines[nextCursor]);
    if (!item) break;
    items.push(item);
    nextCursor += 1;
  }

  return { items, nextCursor };
}

function parseListItem(line: string): ListItem | null {
  const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
  if (!match) return null;

  const taskMatch = /^\[([ xX])\]\s?(.*)$/.exec(match[3]);
  return {
    text: match[3],
    depth: Math.floor(match[1].replace(/\t/g, "    ").length / 2),
    ordered: /^\d/.test(match[2]),
    task: taskMatch
      ? {
          checked: taskMatch[1].toLowerCase() === "x",
          text: taskMatch[2],
        }
      : null,
  };
}

function readParagraph(lines: string[], cursor: number): { lines: MarkdownLine[]; nextCursor: number } {
  const paragraphLines: MarkdownLine[] = [];
  let nextCursor = cursor;

  while (nextCursor < lines.length) {
    const text = lines[nextCursor];
    if (
      isBlank(text) ||
      readCodeBlock(lines, nextCursor) ||
      readTableBlock(lines, nextCursor) ||
      readHtmlBlock(lines, nextCursor) ||
      /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(text) ||
      /^(#{1,6})(?:\s+|$)/.test(text) ||
      /^\s*>/.test(text) ||
      parseListItem(text)
    ) {
      break;
    }

    paragraphLines.push({ text, index: nextCursor });
    nextCursor += 1;
  }

  return { lines: paragraphLines, nextCursor };
}

function splitBlankSeparatedLines(lines: MarkdownLine[]): MarkdownLine[][] {
  const groups: MarkdownLine[][] = [];
  let current: MarkdownLine[] = [];

  for (const line of lines) {
    if (isBlank(line.text)) {
      if (current.length > 0) groups.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

function joinParagraphLines(lines: MarkdownLine[]): string {
  return lines.map((line) => line.text.trim()).filter(Boolean).join(" ");
}

function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

function isMarkdownTableLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.includes("|")) return false;
  if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) return true;
  return /^\|.+\|$/.test(trimmed);
}

function isTableHeaderLine(text: string): boolean {
  return splitTableCells(text).length >= 2;
}

function isTableDelimiterLine(text: string): boolean {
  const cells = splitTableCells(text);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableCells(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed.includes("|")) return [];
  const withoutEdgePipes = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdgePipes.split("|").map((cell) => cell.trim());
}

function isVoidHtmlTag(tagName: string): boolean {
  return [
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "source",
    "track",
    "wbr",
  ].includes(tagName);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

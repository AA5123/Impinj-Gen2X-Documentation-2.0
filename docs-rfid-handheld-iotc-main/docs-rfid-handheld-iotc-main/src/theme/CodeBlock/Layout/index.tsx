/**
 * Swizzled @theme/CodeBlock/Layout (full eject of
 * `@docusaurus/theme-classic/src/theme/CodeBlock/Layout/index.tsx`, v3.10.2).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A FENCED CODE BLOCK AND A <JsonBlock> ARE NOW THE SAME COMPONENT FROM THE OUTSIDE.
 *
 * The brief, three times over: "All elements (including the code blocks, etc.) should be shared
 * between all parts of the site — there should be consistency. The code blocks in the Guides part
 * are different from the code blocks in the API Reference part — especially the MQTT API."
 *
 * The two were measured side by side on 2026-08-30, and the surprise was how much ALREADY matched.
 * Plane, frame, type and ink were identical in both — `--surface-subtle`, 1px `--api-frame`,
 * square corners, IBM Plex Mono 14px/21px at `--zebra-mono-weight` 500, `--technical-code` ink.
 * Every one of those had been unified by the earlier colour and white-ground passes. What had NOT
 * been touched, and what a reader actually sees, is the CHROME:
 *
 *                        <JsonBlock> (MQTT API)          fenced ``` (Guides)
 *   header bar           always, white, 8/11.2px         none, unless `title=` is authored
 *   title                "Request Payload", 13px/600      none
 *   controls             in the bar, always visible       floating over the code, on hover only
 *   copy                 text pill, "Copy"/"Copied"       icon square, no label
 *   word wrap            —                                icon square
 *
 * That is why they read as two components. This file removes the difference at its source rather
 * than restyling one to resemble the other: the layout now emits the SAME class names JsonBlock
 * emits — `json-block`, `json-toolbar`, `json-title`, `json-toolbar-spacer` — so both are painted
 * by the same rules in src/css/api.scss, and a future change to the panel header reaches both
 * without anyone having to remember the second one exists. There is no new "make the code block
 * look like the JSON block" stylesheet, because a copy is the thing that drifts.
 *
 * ── WHAT IS STILL DOCUSAURUS'S, AND DELIBERATELY UNTOUCHED ──────────────────────────────────
 *
 * `<Content />` — the Prism highlight, the line splitting, `showLineNumbers`, the magic-comment
 * line classes, the word-wrap ref — is rendered exactly as upstream renders it, from the same
 * context, with the same props. This file changes the box around the code and nothing inside it.
 * The Container is upstream's too, so `metadata.className` (the `language-*` hook the Prism theme
 * and the line-number CSS both key on) still lands where every stylesheet expects it.
 *
 * ── THE TITLE, WHEN THE AUTHOR DID NOT WRITE ONE ────────────────────────────────────────────
 *
 * JsonBlock's title is semantic and always present ("Request Payload", "Response — error (code
 * 101)"). A fenced block usually has no `title=`, and an empty bar with two buttons in it would be
 * the consistency of shape without the consistency of meaning. So the language fills in: a ```json
 * fence is labelled JSON, a ```bash fence Shell.
 *
 * `text` and its aliases are the deliberate exception. Docusaurus assigns them to any fence with no
 * language AND to anything it cannot resolve, so "Text" would be the label on both a deliberate
 * plain-text block and every mislabelled one — a caption that is right about nothing. Those keep an
 * empty title cell; the bar still renders, because the CONTROLS are the half of it that must not
 * move between blocks, and a code block whose Copy button sits somewhere else on a Guides page than
 * on an API page is the defect this file exists to fix.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {useCodeBlockContext} from '@docusaurus/theme-common/internal';
import Container from '@theme/CodeBlock/Container';
import Title from '@theme/CodeBlock/Title';
import Content from '@theme/CodeBlock/Content';
import Buttons from '@theme/CodeBlock/Buttons';
import type {Props} from '@theme/CodeBlock/Layout';

import styles from '@docusaurus/theme-classic/lib/theme/CodeBlock/Layout/styles.module.css';

/**
 * Display names for the languages this site actually fences, keyed by the Prism id Docusaurus
 * resolves. Anything not listed falls back to the id with its first letter capitalised, which is
 * right far more often than it is wrong (`python` -> Python, `yaml` -> Yaml is the sort of miss
 * worth adding a line for when it appears). The entries below are the ones where the id is NOT the
 * name a reader would use.
 */
const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Shell',
  sh: 'Shell',
  shell: 'Shell',
  console: 'Shell',
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  json: 'JSON',
  json5: 'JSON5',
  jsonc: 'JSONC',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  xml: 'XML',
  sql: 'SQL',
  csv: 'CSV',
  ini: 'INI',
  http: 'HTTP',
  csharp: 'C#',
  cpp: 'C++',
  py: 'Python',
  md: 'Markdown',
  mdx: 'MDX',
  diff: 'Diff',
};

/** Docusaurus's own fallbacks for "no language" and "language I could not resolve". */
const UNLABELLED_LANGUAGES = new Set(['text', 'plaintext', 'plain', 'none', '']);

function languageLabel(language: string | undefined): string | null {
  if (!language || UNLABELLED_LANGUAGES.has(language)) {
    return null;
  }
  return (
    LANGUAGE_LABELS[language] ??
    language.charAt(0).toUpperCase() + language.slice(1)
  );
}

export default function CodeBlockLayout({className}: Props): ReactNode {
  const {metadata} = useCodeBlockContext();
  const title = metadata.title ?? languageLabel(metadata.language);
  return (
    <Container
      as="div"
      className={clsx(className, metadata.className, 'json-block')}>
      {/* One bar, the same bar. `json-title` is rendered even when there is nothing to put in it,
          so the controls sit at the same height and the same distance from the frame in every
          block on the site — an empty <span> occupies no width, and the spacer does the packing. */}
      <div className="json-toolbar">
        <span className="json-title">{title ? <Title>{title}</Title> : null}</span>
        <span className="json-toolbar-spacer" />
        <Buttons />
      </div>
      <div className={styles.codeBlockContent}>
        <Content />
      </div>
    </Container>
  );
}

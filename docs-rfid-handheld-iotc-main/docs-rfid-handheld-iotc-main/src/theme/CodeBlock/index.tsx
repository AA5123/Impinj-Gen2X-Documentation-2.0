/**
 * Swizzled @theme/CodeBlock — a wrapper, not an eject.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A ```json FENCE AND A <JsonBlock> ARE NOW THE SAME COMPONENT, not two that look alike.
 *
 * The 2026-08-30 chrome pass made a fenced block and the API Reference's JSON panels share a
 * toolbar, a title, a Copy pill and a plane — by emitting the same class names, so one stylesheet
 * paints both. That closed the visual gap and left a functional one the owner then named: the
 * reference's panels can be FOLDED. Every object and array carries a +/- disclosure mark, and the
 * toolbar has Expand all / Collapse all. A fenced ```json block had none of it, so the same payload
 * was navigable on one page and a wall of text on another.
 *
 * Styling a second component to grow those controls would have meant reimplementing a JSON tree
 * inside a Prism renderer. The actual fix is one line of routing: if a fence says `json` and its
 * body parses, hand it to `<JsonBlock>` — the very component the reference pages already use. Not
 * a copy of it, not a lookalike; the same module, so the disclosure marks, the bulk controls, the
 * print handling, the overflow region and the a11y wiring all arrive for free and cannot drift.
 *
 * ── WHAT STILL GOES THROUGH PRISM, AND WHY THAT IS NOT AN INCONSISTENCY ────────────────────
 *
 * Everything that is not parseable JSON:
 *
 *   1. OTHER LANGUAGES. A shell command or a topic string has no tree, so there is nothing for a
 *      disclosure mark to fold. Those keep the Prism renderer and the shared chrome — same frame,
 *      same toolbar, same Copy pill, same plane, minus two controls that would have nothing to
 *      act on. The reference pages' own non-JSON blocks are exactly this.
 *   2. JSON THAT DOES NOT PARSE. A fence tagged `json` that carries an ellipsis, a trailing
 *      comment or a fragment is not JSON, and `JSON.parse` is the honest test of that. It falls
 *      back rather than throwing, so an authoring slip degrades to the old rendering instead of
 *      breaking the page. `JsonBlock` takes a real JS value, not a string — the parse is what
 *      makes the hand-off possible at all.
 *
 * ── THE TWO PROPS THAT CARRY OVER ─────────────────────────────────────────────────────────
 *
 * `title=` on the fence becomes JsonBlock's `title`, which is the same slot the reference pages
 * fill with "Request Payload" and friends. When a fence has no title the panel head is left empty
 * rather than being given the language name: `<JsonBlock>` is only ever reached for JSON, so a
 * "JSON" label there would be a constant, and @theme/CodeBlock/Layout only synthesises language
 * labels for the Prism path where the language is actually in question.
 *
 * `showLineNumbers` is still forced on the Prism path and is deliberately NOT passed here —
 * JsonBlock numbers nothing, because a folded tree's line numbers would renumber on every toggle.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import React, {type ReactNode} from 'react';
import OriginalCodeBlock from '@theme-original/CodeBlock';
import type CodeBlockType from '@theme/CodeBlock';
import type {WrapperProps} from '@docusaurus/types';
import {parseCodeBlockTitle} from '@docusaurus/theme-common/internal';
import JsonBlock, {type Json} from '@site/src/components/JsonBlock';

type Props = WrapperProps<typeof CodeBlockType>;

/**
 * THE FENCE'S TITLE, WHICH IS NOT ALWAYS A PROP — corrected 2026-09-10.
 *
 * ```json title="get_wifi — request" puts `title="…"` in the fence's METASTRING. Docusaurus
 * parses that out later, inside `createCodeBlockMetadata`, which is downstream of this wrapper —
 * so `props.title` is populated only when a JSX <CodeBlock title=…> was written by hand, and is
 * undefined for every authored fence. This wrapper reached JsonBlock before that parse happened,
 * so all 110 fence titles rendered as an empty panel head.
 *
 * `parseCodeBlockTitle` is Docusaurus's own parser for the same string, so the two paths cannot
 * disagree about what a title is; the prop still wins when it exists, because a JSX caller is
 * being explicit.
 */
function fenceTitle(props: Props): string | undefined {
  if (typeof props.title === 'string' && props.title) {
    return props.title;
  }
  const meta = (props as {metastring?: string}).metastring;
  const parsed = meta ? parseCodeBlockTitle(meta) : '';
  return parsed || undefined;
}

/** `language-json` may sit among other classes, and `language` may arrive as a prop instead. */
function isJsonFence(props: Props): boolean {
  const language =
    (props as {language?: string}).language ??
    /(?:^|\s)language-(\w+)/.exec(String(props.className ?? ''))?.[1];
  return language?.toLowerCase() === 'json';
}

/**
 * Parses only when the body is a plain string. MDX hands a fence's contents through as a string;
 * anything else (an already-elementised child) is not ours to parse.
 *
 * Returns a one-element tuple rather than the value, so that a payload which is legitimately
 * `null` — valid JSON, and a real thing to document — is distinguishable from a parse failure.
 */
function parseJson(children: unknown): [Json] | null {
  if (typeof children !== 'string') {
    return null;
  }
  try {
    return [JSON.parse(children) as Json];
  } catch {
    return null;
  }
}

export default function CodeBlockWrapper(props: Props): ReactNode {
  if (isJsonFence(props)) {
    const parsed = parseJson(props.children);
    if (parsed) {
      /* `title` is typed ReactNode upstream because the Prism path renders it through
       * @theme/CodeBlock/Title, which passes children straight out. JsonBlock's is a string —
       * it goes into an aria-label as well as the heading — so only a string is forwarded, and
       * a fence carrying markup in its title falls through titleless rather than rendering
       * "[object Object]" into an accessible name. */
      const title = fenceTitle(props);
      return <JsonBlock data={parsed[0]} title={title} />;
    }
  }
  return <OriginalCodeBlock {...props} showLineNumbers />;
}

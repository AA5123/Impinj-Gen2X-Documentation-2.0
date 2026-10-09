/**
 * Swizzled @theme/CodeBlock/Buttons (full eject of
 * `@docusaurus/theme-classic/src/theme/CodeBlock/Buttons/index.tsx`, v3.10.2).
 *
 * TWO changes: the wrapper is `json-bulk-controls` rather than the theme module's `buttonGroup`,
 * and `WordWrapButton` is not rendered.
 *
 * ── WHY WORD WRAP IS GONE (2026-08-30) ──────────────────────────────────────────────────────
 *
 * The API Reference's JSON panels never had it, and the owner asked for one code block across the
 * site rather than two that differ by a control. It was also the odd one out on its own terms: it
 * is the only control here that changes how the CONTENT is laid out rather than acting on it, and
 * Docusaurus only shows it at all when a block is scrollable — so it appeared and vanished between
 * adjacent blocks on the same page, which is the opposite of the consistency this row is for.
 *
 * NOTHING IS LOST FOR THE COMMON CASE. Every parseable ```json fence now renders through
 * <JsonBlock> (see @theme/CodeBlock), which wraps nothing and folds instead — a long payload is
 * navigated by collapsing objects, which is better than wrapping them. What remains on the Prism
 * path is non-JSON: shell commands, topic strings, plain text. Those still scroll horizontally
 * inside the block, and the <pre> keeps `tabIndex={0}` so the scroll region is keyboard-reachable
 * (WCAG 2.1.1). If a language ever arrives whose lines are both long and unfoldable, this is the
 * decision to revisit — and `@theme/CodeBlock/Buttons/WordWrapButton` is deleted with this change,
 * so revisiting it means re-swizzling rather than flipping a line back.
 *
 * That swaps an absolutely-positioned overlay for an ordinary flex row, and it is the reason the
 * controls stop hiding. Upstream's `buttonGroup` is `position: absolute; top: calc(var(--ifm-pre-
 * padding) / 2); right: …; opacity: 0` — it floats over the top-right of the CODE and fades in on
 * hover of the container. `json-bulk-controls` is the group JsonBlock's Expand-all / Collapse-all
 * pair sits in, an inline `display: flex; gap` with no positioning and no opacity, and the layout
 * now puts it inside the toolbar where there is room for it.
 *
 * WHY THAT IS A FIX AND NOT A PREFERENCE. A control revealed only on hover is unreachable by touch
 * except by luck, invisible to anyone scanning the page, and — the part that matters most here —
 * it is why the two kinds of code block on this site looked unrelated: one had a visible header
 * with a labelled Copy in it, the other had nothing until the pointer arrived. Docusaurus's own
 * stylesheet already makes an exception for keyboard users (`:focus-within` un-hides the group),
 * which is the tell that the hidden resting state was the compromise, not the intent.
 *
 * `BrowserOnly` is kept exactly as upstream has it, and the upstream comment with it: these buttons
 * are not server-rendered on purpose. They are inert without React, and the SVG they carry is
 * expensive to put in 214 pages of static HTML for no benefit. The consequence to know about is
 * that the toolbar's right-hand side is empty in the SSR output and fills in on hydration — the bar
 * itself, its frame and its title are server-rendered, so nothing moves when they arrive.
 */
import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import BrowserOnly from '@docusaurus/BrowserOnly';
import CopyButton from '@theme/CodeBlock/Buttons/CopyButton';
import type {Props} from '@theme/CodeBlock/Buttons';

/*
 * `json-toolbar-actions`, NOT `json-bulk-controls` — corrected 2026-09-10.
 *
 * `json-bulk-controls` became T4's RECESSED TRACK: a grey channel holding a pair of borderless
 * icon buttons that do opposite things. Copy is neither of those — it is a single bordered
 * ACTION — so wrapping it in the track handed it the track's fill and stripped its border, which
 * is exactly the owner's report that "the Copy button styling is different" on these blocks.
 * The track is for the state pair; this is the row that sits beside it.
 */
export default function CodeBlockButtons({className}: Props): ReactNode {
  return (
    <BrowserOnly>
      {() => (
        <div className={clsx(className, 'json-toolbar-actions')}>
          <CopyButton />
        </div>
      )}
    </BrowserOnly>
  );
}

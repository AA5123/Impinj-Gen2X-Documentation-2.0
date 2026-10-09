/**
 * Swizzled @theme/DocItem/Footer.
 *
 * Renders a compact "Was this helpful?" prompt with thumbs-up /
 * thumbs-down trigger buttons. Clicking a thumb opens the PushFeedback
 * modal pre-set with that rating, where the user can add a free-text
 * message, email, optional screenshot, and submit.
 *
 * Pattern: official "Like / dislike feedback widget" example from
 * PushFeedback's docs CodePen
 * (https://codepen.io/David-Garcia-the-bashful/pen/jOgWaOp), surfaced
 * at https://docs.pushfeedback.com/customization/layout under the
 * "Like / dislike buttons" heading.
 *
 * The trick: two <feedback-button> elements, one with rating="1"
 * (thumbs up) and one with rating="0" (thumbs down). Each
 * <feedback-button> wraps a custom <button> with the SVG icon — the
 * PushFeedback web component uses its slotted content as the trigger
 * and opens the standard feedback modal (Share your thoughts +
 * Email + Add a screenshot + Send) when clicked.
 *
 * Implementation note (imperative DOM creation):
 *   Stencil web components can race against React's hydration. The
 *   docusaurus-pushfeedback plugin (used in earlier iterations) sets
 *   up <feedback-button> by document.createElement + setAttribute, so
 *   we follow the same pattern here in a useEffect rather than via
 *   JSX. The custom element bundle is loaded globally via
 *   `stylesheets` + `scripts` entries in docusaurus.config.ts.
 */

import React, { useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { ThemeClassNames } from '@docusaurus/theme-common';
import { track } from '@site/src/analytics/track';
import styles from './styles.module.css';

const PROJECT_ID = 'fv5awvu82c';

// Thumb glyphs: LUCIDE thumbs-up / thumbs-down at v1.31.0, transcribed from
// node_modules/lucide-static/icons/thumbs-{up,down}.svg, with stroke="currentColor" so the
// inner <button> owns the colour through CSS rather than a hex.
//
// PROVENANCE CHECKED IN THIS EDIT, not inherited: `cmp` between those two upstream files and the
// tree's own assets/icons/lucide/thumbs-{up,down}.svg is silent (byte-identical), and
// lucide-static is ^1.31.0 in devDependencies. The node_modules path is cited as the durable
// source rather than the vendored copy because `thumbs-up` / `thumbs-down` appear in neither
// REGISTRY nor REACT_ICONS in scripts/site/generate-icons.mjs, so `npm run icons:prune` would
// delete the vendored files — the paths are transcribed here, so a prune cannot change what
// renders, only where a reader can go looking.
//
// THEY REPLACE THE FEATHER-ERA DRAWING FROM PUSHFEEDBACK'S CODEPEN, which is what shipped here
// and is still what docs.pushfeedback.com renders: measured 2026-09-06, its live `d` is
// byte-for-byte the single path this edit removes, while Lucide v1 redrew both thumbs as TWO
// paths. The work order's global exception is that icons come from our pre-installed Lucide
// library, so the glyph follows the library rather than the snippet it was first copied from.
//
// A STRING, NOT <Icon name="…"> FROM src/components/icons/index.tsx. That file is the project's
// REACT half and is the right answer for JSX; this is not JSX. The subtree below is built with
// createElement + innerHTML because Stencil races React's hydration — see this file's header —
// so what is needed here is MARKUP, not an element. The project's other non-JSX mechanism,
// generate-icons.mjs's `--sb-icon-*` data URIs painted with CSS `mask-image`, does not fit
// either: a mask cannot be a <button>'s only child, and currentColor would stop reaching it.
//
// STROKE WIDTH STAYS AT LUCIDE'S 2, not the 1.8 generate-icons.mjs normalises to — that script's
// comment scopes its normalisation to the sidebar glyphs, "which is what keeps them from
// out-weighting the 500-weight label beside them". At the 16px render off a 24-unit viewBox, 2
// units paint 1.33 device px. The width/height ATTRIBUTES drop 22 -> 16 so they agree with
// styles.module.css instead of contradicting it the way the source's 20 does. aria-hidden is
// ours and not Lucide's: the <button> carries the accessible name.
const THUMB_UP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"></path><path d="M7 10v12"></path></svg>`;

const THUMB_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"></path><path d="M17 14V2"></path></svg>`;

// Success and error copy applied to every <feedback-button> so the
// confirmation pop-up uses our wording — see
// https://docs.pushfeedback.com/customization/text for the exact
// attribute names. Stencil kebab-cases the digits individually for
// the HTTP-status-coded errors (modal-title-error-4-0-3, ...-4-0-4).
const FEEDBACK_COPY: Record<string, string> = {
  // Success
  'modal-title-success':
    'Thanks for your feedback!',
  'success-message':
    "Your feedback has been recorded. We use it to make these docs better.",
  // Error
  'modal-title-error':
    'Oops!',
  'error-message':
    'Please try again later.',
  'modal-title-error-4-0-3':
    'The request URL does not match the one defined in PushFeedback for this project.',
  'modal-title-error-4-0-4':
    'We could not find the provided project ID in PushFeedback.',
};

function makeThumbTrigger(
  rating: '1' | '0',
  title: string,
  innerSvg: string,
  buttonClass: string,
): HTMLElement {
  const fb = document.createElement('feedback-button');
  fb.setAttribute('project', PROJECT_ID);
  fb.setAttribute('rating', rating);
  fb.setAttribute('button-style', 'default');
  fb.setAttribute('modal-position', 'center');
  // Apply the success / error copy
  for (const [name, value] of Object.entries(FEEDBACK_COPY)) {
    fb.setAttribute(name, value);
  }

  const inner = document.createElement('button');
  inner.className = buttonClass;
  inner.setAttribute('type', 'button');
  inner.setAttribute('title', title);
  inner.setAttribute('aria-label', title);
  inner.innerHTML = innerSvg;
  // "Was this helpful?" vote — the primary per-page satisfaction signal. Fires
  // on the thumb click (before the PushFeedback modal opens); the free-text
  // comment itself is never captured here.
  //
  // NO removeEventListener, and that is CORRECT — recorded because a reference-hygiene
  // sweep reported it as a leak on the strength of `grep -c removeEventListener` → 0.
  // A count is not the defect. This listener is attached to `inner`, which is appended
  // into the effect's container, and the effect's cleanup below sets that container's
  // innerHTML to '' on unmount — so the node is detached and, since nothing else holds
  // a reference to it or to the handler, the whole subtree is collectible. A listener
  // does not keep its own node alive; the node holds the listener, not the reverse.
  // The container is also cleared at the TOP of the effect, so a remount cannot
  // accumulate widgets either. Removing the listener explicitly would be dead code
  // asserting a bug that does not exist.
  inner.addEventListener('click', () => {
    track('feedback_response', { helpful: rating === '1' ? 'yes' : 'no' });
  });

  fb.appendChild(inner);
  return fb;
}

/**
 * THE WHOLE WIDGET USED TO BE BUILT IN THE EFFECT, AND THAT MADE THE PAGE 75px SHORTER THAN IT
 * WAS ABOUT TO BE — the root cause of "refreshing a page when scrolled to the bottom causes a
 * visible layout shift / scroll jump upward", diagnosed 2026-09-03.
 *
 * The server rendered ONE empty `<div>` here and the effect appended everything into it after
 * hydration, so the document grew by exactly the widget's height a few frames into page life.
 * Measured, two unrelated routes, reload while scrolled to the bottom:
 *
 *     /guides/core-concepts/   scrollHeight 1456 -> 1492 -> 1532   restored scrollY 506 of 582
 *     /api-reference/rest/     scrollHeight 1933 -> 1968 -> 2008   restored scrollY 983 of 1058
 *
 * Both land 75px short of where the reader left them, and the reason is that a browser restores
 * scroll ONCE, CLAMPED to the document's maximum at that instant, and never re-applies it when
 * the document later grows. At the bottom of the page the saved offset IS the maximum, so every
 * pixel the document is missing at restore time is a pixel of scroll silently discarded. Nothing
 * about the restoration is broken; it was handed a document that was not finished.
 *
 * THE FIX IS TO STOP BEING SHORT, NOT TO RE-SCROLL. `history.scrollRestoration = 'manual'` plus a
 * post-layout re-scroll would paper over this one instance and fight Docusaurus's own router for
 * every other, and would still show the reader a 75px jump — it would just end in the right place.
 * Two changes below make the SSR box the settled box instead:
 *
 *   1. THE LABEL IS JSX NOW. It is static text with no Stencil involvement and no reason to have
 *      been imperative; rendered on the server it is real content occupying its real height
 *      (22.4px measured at the 0.875rem the 2026-09-06 restyle put it on; 25.6px before that),
 *      so it needs no reservation at all and the reader sees it immediately
 *      rather than watching it appear.
 *   2. ONLY THE THUMBS ROW IS RESERVED, in styles.module.css, and that is the point of the split:
 *      the row is the one part whose height cannot be derived from server-rendered content, and
 *      its height IS derivable from the button's own fixed geometry. See `.thumbsRow`'s note.
 *
 * `rowRef` REPLACES `containerRef` AND THE EFFECT NO LONGER CLEARS THE WIDGET. Clearing the outer
 * container would now delete React's own label node behind React's back; the effect owns the
 * thumbs row's CHILDREN and nothing else. React renders that row empty and never reconciles into
 * it, which is the same "React-owned host, imperatively populated" arrangement as before, one
 * level lower.
 */
export default function DocItemFooter(): ReactNode {
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    // Cleared at the top as well as on unmount, so a remount (or React's development-mode
    // double-invoked effect) cannot stack two pairs of thumbs in one row.
    row.innerHTML = '';

    row.appendChild(
      makeThumbTrigger('1', 'Yes, this was helpful', THUMB_UP_SVG, styles.thumbBtn),
    );
    row.appendChild(
      makeThumbTrigger('0', 'No, this was not helpful', THUMB_DOWN_SVG, styles.thumbBtn),
    );

    // Cleanup on unmount (client-side route change) so widgets don't pile up.
    return () => {
      row.innerHTML = '';
    };
  }, []);

  return (
    <footer
      className={clsx(
        ThemeClassNames.docs.docFooter,
        'docusaurus-mt-lg',
        styles.feedbackFooter,
      )}
    >
      <div className={styles.feedbackWidget}>
        <div className={styles.label}>Was this helpful?</div>
        <div ref={rowRef} className={styles.thumbsRow} />
      </div>
    </footer>
  );
}

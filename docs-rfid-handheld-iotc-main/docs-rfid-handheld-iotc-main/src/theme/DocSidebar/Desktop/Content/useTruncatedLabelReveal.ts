/**
 * WHICH SIDEBAR LABELS ARE CLIPPED — the half of the reveal that CSS cannot do.
 *
 * Item 3 of .ai-history/072-single-word-truncation.md: a label made of one unbroken token wider
 * than its box ellipsises (src/css/sidebar.scss, NATURAL WORD WRAPPING), and the hidden tail has
 * to stay readable. THE FULL LABEL, REVEALED in that same file does the revealing, in pure CSS, so
 * it fires on `:hover` AND on `:focus-visible` without any JavaScript. What CSS cannot express is
 * the QUESTION — there is no selector for "this element's text overflowed" — so this hook measures
 * and marks, and the stylesheet does the rest.
 *
 * Two attributes on the label span, and the CSS needs both:
 *   data-sb-clipped      the text does not fit its box
 *   data-sb-single-line  ...and it occupies one line, so it is safe to take out of flow
 * The second is not decorative. A MULTI-LINE label taken out of flow leaves its row with nothing
 * to hold it open — measured on a constructed case, a 113px row collapses to 54px and the whole
 * tree below it jumps. No real label in the five sidebars is currently both multi-line and
 * horizontally clipped (real labels top out near 13 characters per word; the 26-character MQTT
 * operation names are single-word, hence single-line by construction), so the gate guards content
 * that does not exist yet. It costs one comparison.
 *
 * THIS REPLACED A NATIVE `title`, 2026-09-08, and the deletion is the point rather than a detail.
 * A `title` answers a mouse and nothing else: no browser shows one on `:focus-visible`, and none
 * shows one on a tap. Deleting it also deletes the double-tooltip problem (browser chrome plus
 * chip), the save/restore handshake needed to suppress one while the other is open, and the
 * failure mode where a row silently keeps a stale tooltip. The CSS chip strictly dominates it.
 *
 * WHY THE MEASUREMENT MUST SUPPRESS THE REVEAL WHILE IT READS — the trap that cost an afternoon
 * in the review harness. Once a chip is open the label IS the chip: out of flow, auto width, so
 * `scrollWidth - clientWidth` is 0. Measure in that state and the gate is removed, which collapses
 * the chip, which restores the overflow, which re-adds the gate on the next pass. Oscillation. So
 * every read happens with `data-sb-measuring` set on the nav, which the stylesheet uses to force
 * the resting geometry for the duration. Both happen inside one frame, so nothing paints in
 * between and there is no flicker.
 *
 * WHY IT CANNOT BE PRECOMPUTED AT BUILD TIME, which is the tempting alternative given the site
 * pre-renders 236 pages: the verdict depends on the font that is actually loaded. The same string
 * measures 166.98px in Inter 500 (its weight as the active row), 163.84px in Inter 400, 161.30px
 * in the `Inter Fallback` face and 153.31px in bare Arial, against a 160.93px box. Every face is
 * `font-display: swap`, so the answer changes after first paint. Hence `document.fonts.ready`.
 *   The usual objection to post-hydration DOM work does not apply. src/css/sidebar.scss carries
 * four rounds of pre-hydration bug reports and every one is about width and position — layout
 * shift. These attributes paint nothing and reserve no space. Measured latency: the row is
 * server-rendered with its final width by 250ms, fonts report loaded at 500ms, and the marks land
 * at about 1750ms on a cold headless load — i.e. it waits on React hydration of a heavy page, not
 * on anything here. Nobody can hover a page that is not yet interactive.
 */
import {useEffect} from 'react';
import {useLocation} from '@docusaurus/router';
import {useSidebarCollapse} from '@site/src/components/SidebarCollapse';

/** The desktop panel's scroll container. This is also 072's mobile-drawer exclusion, for free:
 *  the drawer's list carries `.theme-doc-sidebar-menu` too (theme-classic DocSidebar/Mobile), but
 *  it lives in the navbar's secondary menu, not in this aside — so it is never marked, and the
 *  reveal can never fire there. Which is correct: a tap is neither hover nor focus. The drawer's
 *  own answer is `overflow-wrap: break-word`, in sidebar.scss. */
const NAV = '.theme-doc-sidebar-container nav.menu';

/** Every row's label, both row shapes. The label is unconditionally the sole `<span>` child of the
 *  row's own anchor — the same structural fact sidebar.scss leans on, and it holds on the badged
 *  rows because the badges are pseudo-elements rather than nodes. */
const LABEL = '.menu__link > span';

const CLIPPED = 'data-sb-clipped';
const SINGLE = 'data-sb-single-line';
const MEASURING = 'data-sb-measuring';
const DISMISSED = 'data-sb-tip-dismissed';

/** A label counts as one line while its box is under this many line-heights. 1.5 rather than 1.0
 *  because a single line box can exceed its own `line-height` slightly with some fallback metrics,
 *  and 1.5 cannot be reached by two lines. */
const SINGLE_LINE_RATIO = 1.5;

export default function useTruncatedLabelReveal(): void {
  const {pathname} = useLocation();
  const collapse = useSidebarCollapse();
  /* The 48px icon rail replaces every label with a 1x1 `clip-path` box, so ALL of them report
     `scrollWidth > clientWidth` — measured, 12 of 12 rows. Without this guard the rail's own chip
     would be joined by a second, wrong one. Reading it from the context rather than sniffing the
     class keeps it reactive; it is in the deps below. */
  const collapsed = collapse?.collapsed ?? false;

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>(NAV);
    if (!nav) {
      /* Fails closed: no nav, no marks, and a sidebar that still renders correctly. Same posture
         as the scroll-rule effect in this folder's index.tsx. */
      return undefined;
    }

    let frame = 0;
    let cancelled = false;

    const clearAll = () => {
      nav.querySelectorAll<HTMLElement>(`[${CLIPPED}]`).forEach((el) => {
        el.removeAttribute(CLIPPED);
        el.removeAttribute(SINGLE);
      });
    };

    const sync = () => {
      frame = 0;
      if (collapsed) {
        clearAll();
        return;
      }
      const labels = Array.from(nav.querySelectorAll<HTMLElement>(LABEL));

      /* SUPPRESS, READ, WRITE, RELEASE — all synchronous, so no frame is painted mid-pass.
         See the header note on oscillation for why the suppression is not optional. */
      nav.setAttribute(MEASURING, '');
      const reads = labels.map((el) => {
        const line = parseFloat(getComputedStyle(el).lineHeight);
        return {
          el,
          clipped: el.scrollWidth - el.clientWidth >= 1,
          /* `getBoundingClientRect().height`, not `clientHeight`: the latter is integer-rounded
             and is 0.2px wrong on a wrapped row, which is exactly the boundary being tested. */
          oneLine: el.getBoundingClientRect().height < (Number.isFinite(line) ? line : 18.2) * SINGLE_LINE_RATIO,
        };
      });
      nav.removeAttribute(MEASURING);

      reads.forEach(({el, clipped, oneLine}) => {
        /* ALWAYS SET OR CLEAR, NEVER JUST SKIP. A row that stops being clipped — the tree
           collapsed, the window widened, a webfont finally landed — must lose the affordance, or
           it promises hidden text that is now fully visible. */
        if (clipped) {
          el.setAttribute(CLIPPED, '');
        } else {
          el.removeAttribute(CLIPPED);
        }
        if (clipped && oneLine) {
          el.setAttribute(SINGLE, '');
        } else {
          el.removeAttribute(SINGLE);
        }
      });
    };

    const schedule = () => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(sync);
    };

    schedule();

    /* Panel width: collapse/expand, and browser zoom. */
    const resize = new ResizeObserver(schedule);
    resize.observe(nav);

    /* THE TRIGGER THAT IS EASY TO MISS. Rows mount lazily — theme-common's `Collapsible` is
       `lazy`, and src/theme/DocSidebarItem/Category remounts whole subtrees on a `key` change — so
       a category opening adds label nodes that no ResizeObserver on the nav will report.
         `attributes` STAYS OFF, deliberately: this effect's own writes are attribute mutations,
       and observing them would re-trigger it on every pass. */
    const mutate = new MutationObserver(schedule);
    mutate.observe(nav, {childList: true, subtree: true});

    /* The webfont swap, which changes the answer and which no observer can see. */
    if (typeof document.fonts !== 'undefined') {
      document.fonts.ready
        .then(() => {
          if (!cancelled) {
            schedule();
          }
        })
        .catch(() => {
          /* A rejected font promise is not a reason to leave the sidebar worse than the first
             pass already left it. */
        });
    }

    /* WCAG 1.4.13 Dismissable, and the whole of it. Escape sets an attribute the stylesheet's
       `nav.menu:not([data-sb-tip-dismissed])` guard reads; the next pointer or focus move clears
       it, so one dismissal never latches the feature off. `keydown` in the CAPTURE phase because
       the row is an anchor inside a nav that other handlers also listen to, and dismissing a
       tooltip should not depend on winning a bubble race. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        nav.setAttribute(DISMISSED, '');
      }
    };
    const undismiss = () => {
      if (nav.hasAttribute(DISMISSED)) {
        nav.removeAttribute(DISMISSED);
      }
    };
    document.addEventListener('keydown', onKey, true);
    nav.addEventListener('pointermove', undismiss, {passive: true});
    nav.addEventListener('focusin', undismiss);

    return () => {
      cancelled = true;
      if (frame) {
        cancelAnimationFrame(frame);
      }
      resize.disconnect();
      mutate.disconnect();
      document.removeEventListener('keydown', onKey, true);
      nav.removeEventListener('pointermove', undismiss);
      nav.removeEventListener('focusin', undismiss);
      nav.removeAttribute(MEASURING);
      nav.removeAttribute(DISMISSED);
      clearAll();
    };
    /* `pathname` because the ACTIVE row is weight 500 against 400 everywhere else — a measured
       3.15px difference on the one string this feature exists for, i.e. enough to change the
       verdict on its own. `collapsed` because the rail's labels are all 1x1. */
  }, [pathname, collapsed]);
}

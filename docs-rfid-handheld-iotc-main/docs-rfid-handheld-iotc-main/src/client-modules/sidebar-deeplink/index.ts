import type { ClientModule } from '@docusaurus/types';
import './styles.scss';

/**
 * Sidebar deep-linking + auto-scroll.
 *
 * Not deep-link-only, despite the folder name: `onRouteDidUpdate` fires on
 * initial load and on every client-side navigation, so an ordinary sidebar
 * click takes the same path as a pasted deep link. What each surface gets:
 *
 *  - LEFT sidebar (page nav): the link for the current page
 *    (`.menu__link--active`) is scrolled into view *within the sidebar's own
 *    scroll container* (never the window), so a reader who lands on e.g.
 *    /fleet/cloud-integration/gcp/ immediately sees where "How to integrate
 *    IOTC with Google Cloud IoT" sits in the tree. No flash: the active link
 *    already carries a permanent 3px brand bar, bold weight and Infima's
 *    active background.
 *
 *  - RIGHT sidebar (section nav / TOC): when the URL has a hash
 *    (e.g. /diagnose/failure-modes/#fm-sec-03), the matching table-of-contents
 *    entry is scrolled into view within the TOC (again, no flash — it has its
 *    own 2px brand bar), and the target heading in the article is briefly
 *    highlighted, since a mid-document heading has no persistent marker.
 *
 *  - RIGHT sidebar (ScrollSpy follow): as the reader scrolls the article,
 *    Docusaurus highlights the active TOC entry; a MutationObserver keeps that
 *    active entry in view within the TOC's own scroll container, so it never
 *    drifts below the fold on long pages (e.g. /diagnose/failure-modes/).
 *
 * Pure DOM, no dependencies.
 */

const HEADING_FLASH = 'deeplink-flash-heading';

// ScrollSpy → TOC sync state: one observer, re-attached on each route update.
let tocObserver: MutationObserver | null = null;
let tocSyncRaf = 0;

function isScrollable(node: HTMLElement): boolean {
  const oy = getComputedStyle(node).overflowY;
  return (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight + 4;
}

/** Nearest ancestor that actually scrolls vertically (or null if none). */
function scrollableAncestor(el: Element | null): HTMLElement | null {
  let node: HTMLElement | null = el ? el.parentElement : null;
  while (node && node !== document.body) {
    if (isScrollable(node)) return node;
    node = node.parentElement;
  }
  return null;
}

/** Center `el` inside its own scroll container, leaving the window untouched. */
function centerWithinSidebar(el: HTMLElement): void {
  const container = scrollableAncestor(el);
  if (!container) return; // nothing to scroll — the item is already on screen
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const delta = eRect.top - cRect.top - container.clientHeight / 2 + eRect.height / 2;
  const target = Math.max(0, container.scrollTop + delta);
  if (Math.abs(target - container.scrollTop) < 4) return; // already roughly centered
  // Honor reduced-motion: skip the smooth animation, jump instantly.
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    container.scrollTop = target;
    return;
  }
  try {
    container.scrollTo({ top: target, behavior: 'smooth' });
  } catch {
    container.scrollTop = target;
  }
}

/**
 * Keep `el` visible inside its own scroll container with the *minimal* movement
 * needed (unlike centering). Used for continuous ScrollSpy sync so the TOC does
 * not jump on every scroll tick. Instant scroll — no animation queue, so no jank
 * during rapid scrolling. Never touches the window scroll position.
 */
function revealWithinSidebar(el: HTMLElement): void {
  const container = scrollableAncestor(el);
  if (!container) return; // already on screen, or nothing scrollable
  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const margin = 16; // breathing room above/below the active item
  let delta = 0;
  if (eRect.top < cRect.top + margin) delta = eRect.top - (cRect.top + margin);
  else if (eRect.bottom > cRect.bottom - margin) delta = eRect.bottom - (cRect.bottom - margin);
  if (delta === 0) return; // already comfortably in view
  const max = container.scrollHeight - container.clientHeight;
  const target = Math.max(0, Math.min(container.scrollTop + delta, max));
  if (Math.abs(target - container.scrollTop) >= 1) container.scrollTop = target;
}

/** Bring the currently-highlighted desktop-TOC link into view (ScrollSpy). */
function syncActiveTocIntoView(): void {
  const active = document.querySelector<HTMLElement>(
    '.theme-doc-toc-desktop .table-of-contents__link--active',
  );
  if (active) revealWithinSidebar(active);
}

/**
 * Watch the desktop TOC for active-class changes — Docusaurus' ScrollSpy toggles
 * `.table-of-contents__link--active` as the reader scrolls — and keep the active
 * entry in view within the (sticky, overflow-y:auto) TOC container. Re-attached
 * on every route update; coalesced to one sync per animation frame so bursts of
 * class mutations stay cheap.
 */
function attachTocScrollSync(): void {
  if (tocObserver) {
    tocObserver.disconnect();
    tocObserver = null;
  }
  const toc = document.querySelector<HTMLElement>('.theme-doc-toc-desktop');
  if (!toc) return; // page has no desktop TOC (few or no headings)
  syncActiveTocIntoView(); // initial alignment (e.g. a mid-page deep-link)
  tocObserver = new MutationObserver(() => {
    if (tocSyncRaf) return; // coalesce a burst of mutations into one frame
    tocSyncRaf = window.requestAnimationFrame(() => {
      tocSyncRaf = 0;
      syncActiveTocIntoView();
    });
  });
  tocObserver.observe(toc, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

function flash(el: Element | null, cls: string, ms: number): void {
  if (!el) return;
  el.classList.remove(cls);
  // force a reflow so re-adding the class restarts the animation
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}

function cssEscape(s: string): string {
  const c = (window as unknown as { CSS?: { escape?: (v: string) => string } }).CSS;
  if (c && typeof c.escape === 'function') return c.escape(s);
  return s.replace(/["\\\]]/g, '\\$&');
}

function orient(pathChanged: boolean): void {
  // ---- LEFT SIDEBAR: reveal the active page link ----
  if (pathChanged) {
    const activeLink = document.querySelector<HTMLElement>(
      '.menu__link--active:not(.menu__link--sublist), .theme-doc-sidebar-menu a.menu__link[aria-current="page"]',
    );
    if (activeLink) {
      // Minimal-movement reveal (not center): only scroll when the active link
      // is actually out of view, so navigating within a visible Part/group
      // doesn't yank the sidebar. (The hash-anchor case below still centers.)
      revealWithinSidebar(activeLink);
    }
  }

  // ---- RIGHT SIDEBAR + heading: only when the URL carries a section hash ----
  const rawHash = window.location.hash;
  if (rawHash && rawHash.length > 1) {
    let id = rawHash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw id */
    }
    const tocLink =
      document.querySelector<HTMLElement>(`.table-of-contents a[href="#${cssEscape(id)}"]`) ||
      document.querySelector<HTMLElement>('.table-of-contents__link--active');
    if (tocLink) {
      centerWithinSidebar(tocLink);
    }
    const heading = document.getElementById(id);
    if (heading) {
      // 900ms — matches the deeplink-heading-fade keyframe in ./styles.scss, so
      // the class comes off exactly as the animation ends.
      flash(heading, HEADING_FLASH, 900);
    }
  }
}

const clientModule: ClientModule = {
  onRouteDidUpdate({ location, previousLocation }) {
    if (typeof document === 'undefined') return;
    const pathChanged = location.pathname !== previousLocation?.pathname;
    // Let the sidebar/TOC render and the browser's native hash-scroll settle
    // before measuring positions. Longer delay on a full page change.
    window.setTimeout(() => {
      orient(pathChanged);
      attachTocScrollSync();
    }, pathChanged ? 350 : 120);
  },
};

export default clientModule;

/* Per-interaction smooth scroll for in-page anchors — owner ruling 26 of 2026-08-12, which
   replaced a root `scroll-behavior: smooth` (design system §7.4(3)). The rationale, the four
   deliberate exclusions and the reason this block sits below `export default` rather than beside
   the code it extends are recorded in the governance register, not here. Nothing below calls a
   window-scrolling API: the scroll stays the browser's. */

const SMOOTH_SCROLL = 'deeplink-smooth-scroll';

/** Backstop disarm where `scrollend` is unsupported; also caps one armed window. */
const SMOOTH_SCROLL_MAX_MS = 1200;

let clickWired = false;
let smoothScrollTimer = 0;

/** A second copy of centerWithinSidebar()'s query, not a refactor: that block is cited by line. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Take the opt-in back off. Idempotent, and removes its own listener. */
function disarmSmoothScroll(): void {
  if (smoothScrollTimer) {
    window.clearTimeout(smoothScrollTimer);
    smoothScrollTimer = 0;
  }
  window.removeEventListener('scrollend', disarmSmoothScroll);
  document.documentElement.classList.remove(SMOOTH_SCROLL);
}

/** Arm for exactly one fragment navigation. `scrollend` disarms; the timer is the backstop. */
function armSmoothScroll(): void {
  disarmSmoothScroll(); // a second click collapses onto one armed window
  document.documentElement.classList.add(SMOOTH_SCROLL);
  window.addEventListener('scrollend', disarmSmoothScroll);
  smoothScrollTimer = window.setTimeout(disarmSmoothScroll, SMOOTH_SCROLL_MAX_MS);
}

/** True only for a plain left-click the UA will answer with a same-document jump. */
function isInPageAnchorActivation(event: MouseEvent): boolean {
  if (event.defaultPrevented) return false; // the skip-to-content exclusion — see the register
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  const target = event.target as Element | null;
  const anchor =
    target && typeof target.closest === 'function'
      ? target.closest<HTMLAnchorElement>('a[href]')
      : null;
  if (!anchor) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  // In-page anchors only: a link to another PATH that carries a hash is not this case.
  const href = anchor.getAttribute('href');
  if (!href || href.length < 2 || href.charAt(0) !== '#') return false;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return false;
  }
  if (url.pathname !== window.location.pathname || url.search !== window.location.search) {
    return false;
  }
  let id = url.hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    /* keep raw id */
  }
  return !!id && !!document.getElementById(id);
}

/** One document-level listener per page load, not one per route update. */
function wireAnchorSmoothScroll(): void {
  if (clickWired || typeof document === 'undefined') return;
  clickWired = true;
  // BUBBLE phase, so React's root handler has already run and defaultPrevented is meaningful:
  // never `{ capture: true }`.
  document.addEventListener('click', (event: MouseEvent) => {
    if (prefersReducedMotion()) return; // §7.4(5); the CSS gate in ./styles.scss says the same
    if (isInPageAnchorActivation(event)) armSmoothScroll();
  });
}

/* Wired on the first route update, exactly as a call placed inside the handler above would be:
   the listener must not be live before React's root click handler is, or the skip-to-content
   exclusion has no `defaultPrevented` to read. Composed here so every line this change adds
   lands below the module's previous last line and no cited line moves. */
const orientOnRouteDidUpdate = clientModule.onRouteDidUpdate;
clientModule.onRouteDidUpdate = (args) => {
  wireAnchorSmoothScroll();
  return orientOnRouteDidUpdate?.(args);
};

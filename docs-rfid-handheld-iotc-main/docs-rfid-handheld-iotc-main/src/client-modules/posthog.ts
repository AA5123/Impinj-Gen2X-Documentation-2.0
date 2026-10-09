import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import siteConfig from '@generated/docusaurus.config';
import type { ClientModule } from '@docusaurus/types';
import { track } from '@site/src/analytics/track';
import { bootstrapPostHog, type PostHogConfig } from '@site/src/analytics/posthog-loader';

/**
 * PostHog visitor analytics — minimal-footprint client module.
 *
 * Design (see _meta/governance/analytics/analytics-tracking-plan-and-tool-recommendation.md):
 *  - Cookieless, consent-free launch (no banner). Requires "Cookieless server
 *    hash mode" enabled in PostHog Project Settings → Web analytics.
 *  - Autocapture / session replay / surveys / heatmaps / exceptions / web
 *    experiments are all DISABLED, so none of their CDN chunks ever load — only
 *    the core SDK plus the async $web_vitals chunk.
 *  - Every custom event is fired EXPLICITLY via track() from real components or
 *    the delegated listeners below (no autocapture).
 *  - Inert unless POSTHOG_KEY is set at build time (docusaurus.config customFields);
 *    with no key, nothing loads and nothing is sent (local/PR builds stay clean).
 */

interface PostHogSettings {
  key?: string;
  apiHost?: string;
  uiHost?: string;
}

const settings = (siteConfig.customFields?.posthog ?? {}) as PostHogSettings;
const BASE_URL = siteConfig.baseUrl || '/';
const ENABLED = ExecutionEnvironment.canUseDOM && !!settings.key;

/** Strip the site baseUrl so path checks are baseUrl-agnostic. */
function toRelative(pathname: string): string {
  if (BASE_URL !== '/' && pathname.startsWith(BASE_URL)) {
    return '/' + pathname.slice(BASE_URL.length);
  }
  return pathname;
}

// Content-group names are ANALYTICS DIMENSION VALUES, not copy, and renaming one
// splits its own history: every event recorded before this change carries the old
// value and every event after carries the new one, so a single group-by returns two
// rows for one surface and no back-fill is possible from here. The '/reference/'
// group was renamed from 'API Reference' to 'MQTT API' on 2026-08-14 to match the
// navbar, the footer and the page title, on the owner's instruction recorded as
// item K of _meta/governance/audits/owner-rulings-2026-08-13.md. The consequence
// was accepted deliberately: a dimension value that no longer matches any string a
// reader can see is worse for whoever reads the funnel than one dated split, and
// the split is discoverable because this comment dates it. Anyone comparing across
// 2026-08-14 must union the two values.
// THE PREFIXES ARE ROUTES, AND ROUTES MOVE. Re-pointed 2026-08-15 with the IA
// restructure. Before that edit every branch below tested a prefix that no longer
// existed, so `return 'Guides'` was reached for 100% of canonical pages and the
// dimension was silently collapsed to one value — no error, no warning, and the
// event volume unchanged, which is exactly why nothing noticed. Re-pointed again on
// 2026-08-16 with the 019/020 restructure. The old prefixes no longer resolve at all —
// the redirect layer was removed once it was established the site had not been
// published — so a stale prefix here is now a dimension that simply never fires.
//   IF YOU MOVE A ROUTE, GREP THIS FILE. It is the one consumer of URL shape that
// the build cannot check: `onBrokenLinks` validates links, not string prefixes.
//   2026-08-18 — THE 'REST API' GROUP STILL FIRES, BUT IT COUNTS SOMETHING DIFFERENT,
// and that is worth a line here because the failure mode this file keeps warning about
// (a dimension that silently stops meaning what it meant) has happened again in a new
// shape. The prefix below did NOT move, so nothing here needed editing. What changed is
// underneath it: the 73 FXR operations are no longer Docusaurus routes. Scalar addresses
// them with a URL FRAGMENT (`#tag/<tag>/<METHOD><path>`), and a fragment change is not a
// route change — it does not go through Docusaurus' router and fires nothing here. So
// `/api-reference/rest/endpoints` reports ONE pageview no matter how many operations a
// reader opens, and $pageleave fires once, on leaving the reference entirely. Event VOLUME
// for the group drops and time-on-page rises, with no error and no code change to point at.
// Per-operation depth would need an explicit `hashchange` capture on that route.
function contentGroup(pathname: string): string {
  const rel = toRelative(pathname);
  if (rel.startsWith('/api-reference/mqtt/')) return 'MQTT API';
  if (rel.startsWith('/api-reference/rest/')) return 'REST API';
  if (rel.startsWith('/guides/quick-start/')) return 'Quick Start';
  if (rel.startsWith('/guides/core-concepts/')) return 'Foundations';
  if (rel.startsWith('/guides/get-oriented/')) return 'Foundations';
  if (rel.startsWith('/guides/diagnose-and-recover/')) return 'Diagnose';
  if (rel.startsWith('/resources/')) return 'Resources';
  return 'Guides';
}

// Query-string keys scrubbed from URLs before any event leaves the browser
// (never send raw search text, tokens, serials, EPCs, or broker hosts).
// `url` + `referrer` are here because the /report-broken-link page carries the
// originally-attempted URL and referrer as query params (see NotFoundBody); the
// auto $pageview for that page would otherwise egress them (and any token/serial
// nested inside) verbatim.
const SCRUB_PARAMS = ['q', 'query', 'view', 'token', 'access_token', 'serial', 'epc', 'host', 'broker', 'url', 'referrer'];
function scrubUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    const u = new URL(value);
    SCRUB_PARAMS.forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return value;
  }
}

function buildConfig(): PostHogConfig {
  return {
    api_host: settings.apiHost || 'https://us.i.posthog.com',
    ui_host: settings.uiHost || 'https://us.posthog.com',
    // Pin modern defaults (SPA history_change pageviews became default here).
    defaults: '2025-05-24',

    // Consent-free, cookieless posture.
    cookieless_mode: 'always',
    person_profiles: 'identified_only', // we never identify() → no profiles are created

    // Pageviews + engagement (core; no extra chunk).
    capture_pageview: 'history_change',
    // NOTE: this value does NOT make $pageleave fire on SPA navigation. In
    // posthog-js the history_change autocapture emits only $pageview on route
    // changes; $pageleave is emitted solely on real DOM unload (pagehide), whose
    // best-effort beacon is rarely delivered on a navigation-heavy docs SPA — so
    // it yields ~zero $pageleave. We therefore emit $pageleave ourselves on each
    // client-side route change (see the clientModule's onRouteUpdate below). This
    // value is left as the SDK default and still governs the unload-path pageleave.
    capture_pageleave: 'if_capture_pageview',

    // Native Core Web Vitals: lazy async chunk, off the critical path,
    // independent of autocapture. Emits $web_vitals.
    capture_performance: { web_vitals: true, network_timing: false },

    // Load nothing we don't use — each flag prevents a CDN chunk / listeners.
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false, // default is TRUE → would otherwise load a chunk
    disable_session_recording: true,
    disable_surveys: true,
    capture_heatmaps: false,
    capture_exceptions: false,
    disable_web_experiments: true,

    // Per-event content group + PII scrubbing. before_send is the current hook.
    before_send: (event: {properties?: Record<string, unknown>} | null | undefined) => {
      if (!event) return event;
      const props = event.properties ?? {};
      const pathname = typeof props.$pathname === 'string' ? props.$pathname : '';
      props.content_group = contentGroup(pathname);
      props.$current_url = scrubUrl(props.$current_url);
      props.$referrer = scrubUrl(props.$referrer);
      event.properties = props;
      return event;
    },

    loaded: (ph: {debug?: () => void}) => {
      if (process.env.NODE_ENV === 'development' && ph && typeof ph.debug === 'function') {
        ph.debug();
      }
    },
  };
}

// Guards a single in-flight DocSearch observation session (see below).
let docSearchActive = false;

/**
 * Observe one DocSearch (Algolia) search session, read-only, until the modal is
 * dismissed. We send the query LENGTH (never the text) plus whether it produced
 * results — the zero-result signal being the content-gap metric — and let
 * Algolia remain the system of record for query relevance. The modal is a
 * light-DOM React portal, so polling it cannot touch or break the search. A
 * query is reported once it has stayed unchanged for at least one tick (typing
 * paused) and its results have settled; each distinct query reports once.
 */
function trackDocSearchSession(): void {
  if (docSearchActive) return;
  docSearchActive = true;
  const reported = new Set<string>();
  let prevQuery = '';
  let seen = false;
  let waited = 0;
  const poll = setInterval(() => {
    try {
      const modal = document.querySelector('.DocSearch-Modal');
      if (!modal) {
        // Modal gone after being seen = closed; never seen within ~10s = no-op open.
        if (seen || ++waited > 20) {
          clearInterval(poll);
          docSearchActive = false;
        }
        return;
      }
      seen = true;
      const input = modal.querySelector('.DocSearch-Input') as HTMLInputElement | null;
      const query = input ? input.value.trim() : '';
      const stable = query !== '' && query === prevQuery; // unchanged for ≥1 tick
      prevQuery = query;
      if (!stable || reported.has(query)) return;
      const container = document.querySelector('.DocSearch-Container');
      if (container && (container.getAttribute('class') || '').includes('Stalled')) return;
      const hasHits = !!modal.querySelector('.DocSearch-Hit');
      const noResults = !!modal.querySelector('.DocSearch-NoResults');
      if (!hasHits && !noResults) return; // results not settled yet
      reported.add(query);
      const hasResults = hasHits && !noResults;
      track('docsearch_query', { query_len: query.length, has_results: hasResults });
      if (!hasResults) track('docsearch_zero_results', { query_len: query.length });
    } catch {
      /* analytics polling must never throw */
    }
  }, 500);
}

/**
 * One delegated, capture-phase click listener drives every click-based event,
 * so no per-component wiring (and no autocapture) is needed. Registered once;
 * document-level listeners persist across SPA navigation.
 *
 * THE FOUR LISTENERS BELOW ARE NEVER REMOVED, AND MUST NOT BE. Recorded because a
 * reference-hygiene sweep reported them as a leak on the strength of
 * `grep -c removeEventListener` → 0 in this file. The count is right and the
 * conclusion does not follow. This function is called EXACTLY ONCE, from the
 * module-scope `if (ENABLED)` block at the bottom of the file — not from
 * `onRouteUpdate` and not from `onRouteDidUpdate` — and a Docusaurus client module's
 * top-level code runs once per full page load. The targets are `document` and
 * `window`, which live exactly as long as that page. So nothing accumulates across
 * SPA navigation, which is the only leak shape available here, and there is no later
 * moment at which removing them would do anything except stop analytics working.
 * That is also why they are delegated: one document-level listener survives every
 * route change, where per-component wiring would have to be re-attached each time.
 */
function registerDomListeners(): void {
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      try {
        // Code-block copy: the Prism copy button (inside Docusaurus' CodeBlock)
        // OR the JsonBlock "Copy" button (.json-copy) on API-reference Example
        // payloads — the dominant copy interaction on reference pages.
        const copyBtn = target.closest('button[class*="copyButton"], button.json-copy');
        if (copyBtn) {
          let language: string;
          if (copyBtn.classList.contains('json-copy')) {
            language = 'json';
          } else {
            const langHost = copyBtn.closest('[class*="language-"]');
            const m = /language-([\w-]+)/.exec(langHost ? langHost.className : '');
            language = m ? m[1] : 'unknown';
          }
          track('code_copy', { language });
          return;
        }
        // "Copy page" dropdown (Markdown-for-LLM / open-in-AI actions).
        const menuItem = target.closest('[aria-label="Copy page actions"] [role="menuitem"]');
        if (menuItem) {
          const label = (menuItem.textContent || '').toLowerCase();
          const evt = label.includes('copy page')
            ? 'copy_page_markdown'
            : label.includes('view as markdown')
              ? 'view_page_markdown'
              : label.includes('chatgpt')
                ? 'open_in_chatgpt'
                : label.includes('claude')
                  ? 'open_in_claude'
                  : null;
          if (evt) track(evt);
          return;
        }
        // SchemaTable full-bleed "Expand table" — fire only on expand (not collapse).
        const fullbleed = target.closest('.schema-fullbleed-toggle');
        if (fullbleed) {
          if (fullbleed.getAttribute('aria-pressed') !== 'true') track('schema_expand_table');
          return;
        }
        // Expand-all / Collapse-all (schema + JSON trees); ignore disabled no-ops.
        const treeBtn = target.closest(
          '.schema-controls button[aria-label], .json-bulk-controls button[aria-label]',
        );
        if (treeBtn) {
          if (treeBtn.getAttribute('aria-disabled') !== 'true') {
            const label = (treeBtn.getAttribute('aria-label') || '').toLowerCase();
            const action = label.includes('expand')
              ? 'expand_all'
              : label.includes('collapse')
                ? 'collapse_all'
                : '';
            if (action) track('schema_tree_toggle', { action });
          }
          return;
        }
        // ApiBody Example ↔ Schema tab switch.
        const tab = target.closest('.api-body-tabs [role="tab"]');
        if (tab) {
          track('api_body_view_switch', { view: (tab.textContent || '').trim().toLowerCase() });
          return;
        }
        // Search opened (Algolia DocSearch button): usage rate + start a
        // read-only observation of this search session (query length + outcome).
        if (target.closest('.DocSearch-Button')) {
          track('docsearch_opened');
          trackDocSearchSession();
          return;
        }
        // DocSearch result opened — the per-search success signal. `position` is
        // the clicked hit's 1-based rank. In the recent-searches start screen the
        // Save/Remove action buttons sit INSIDE the hit's <a>, so exclude any
        // <button> click (a genuine result hit contains none) — otherwise deleting
        // a recent search would masquerade as opening a result. Hit links are
        // internal, so the outbound check below never applies; return once recorded.
        const hit = target.closest('.DocSearch-Hit');
        if (hit && target.closest('a') && !target.closest('button')) {
          const hits = Array.from(document.querySelectorAll('.DocSearch-Hit'));
          const idx = hits.indexOf(hit);
          track('docsearch_result_click', idx >= 0 ? { position: idx + 1 } : {});
          return;
        }
        // Outbound links (host only — never the full URL).
        const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
        if (anchor) {
          let host = '';
          try {
            host = new URL(anchor.href, window.location.href).host;
          } catch {
            host = '';
          }
          if (host && host !== window.location.host) {
            if (/(^|\.)zebra\.com$/i.test(host)) track('outbound_click_zebra', { host });
            else track('outbound_click_external', { host });
          }
        }
      } catch {
        /* a tracking failure must never interfere with the click */
      }
    },
    true, // capture phase: see the click even if a handler stops propagation
  );

  // 404 views — NotFoundBody already dispatches a window `zebra:404` event.
  window.addEventListener('zebra:404', (e) => {
    const detail = ((e as CustomEvent).detail || {}) as { attemptedUrl?: unknown; referrer?: unknown };
    track('not_found_view', {
      // Path only — strip the query string, which may carry tokens/serials/EPCs
      // (custom props bypass the $current_url scrub in before_send).
      attempted_path:
        typeof detail.attemptedUrl === 'string' ? detail.attemptedUrl.split('?')[0] : undefined,
      has_referrer: !!detail.referrer,
    });
  });

  // Search opened via the ⌘K / Ctrl+K shortcut (the '.DocSearch-Button' click
  // path above covers pointer opens). Together they approximate search-usage
  // rate; Algolia stays the system of record for query relevance.
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      track('docsearch_opened');
      trackDocSearchSession();
    }
  });

  // Feedback comment submitted. The PushFeedback modal POSTs the free-text
  // message and, on a successful save, emits a `feedbackSent` Stencil event
  // (bubbles + composed, so it reaches document); we record only WHETHER a
  // comment was written, never its text. The thumb vote itself is
  // feedback_response, fired on the thumb click in DocItem/Footer.
  document.addEventListener('feedbackSent', (e) => {
    try {
      const detail = (e as CustomEvent).detail as { feedback?: { message?: unknown } } | null;
      const message = detail && detail.feedback ? detail.feedback.message : undefined;
      const hasText = typeof message === 'string' && message.trim().length > 0;
      track('feedback_comment_submit', { has_text: hasText });
    } catch {
      /* a tracking failure must never interfere */
    }
  });
}

if (ENABLED) {
  try {
    bootstrapPostHog(settings.key as string, buildConfig());
    registerDomListeners();
  } catch {
    /* analytics bootstrap must never break app hydration */
  }
}

// ---- Quick-start phase-completion signal (inferred, read-only) ----
// The site is static + cookieless with no backend, so it can NEVER observe the
// off-site MQTT artifact each phase produces. We therefore fire a read-depth
// PROXY — honestly named quickstart_phase_reached, NOT _complete — when the
// reader scrolls that phase's "### Success Check" heading (the artifact checklist
// that ends every phase page; slug #success-check) into view and dwells there.
// Purely observational: it never mutates the DOM, so it cannot affect the page or
// the search. Deduped once per phase per browser TAB (sessionStorage), which keeps
// view→reached→next-view inside one cookieless anonymous id. quickstart_completed
// fires when the final phase's checklist is reached, carrying phases_reached as
// the honesty valve (8 = a genuine same-session run; 1 = a deep-link to phase 8).
const QS_FINAL_PHASE = 8; // keep in lockstep with scripts/lint-quickstart-sections.mjs
const QS_DWELL_MS = 1500;
const QS_KEY = 'zebra_qs_reached';
let qsObserver: IntersectionObserver | null = null;
let qsDwell: ReturnType<typeof setTimeout> | null = null;
let qsToken = 0;

function qsReached(): number[] {
  try {
    const raw = window.sessionStorage.getItem(QS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return []; // private mode / disabled storage → dedup simply no-ops
  }
}
function qsSave(done: number[]): void {
  try {
    window.sessionStorage.setItem(QS_KEY, JSON.stringify(done));
  } catch {
    /* storage unavailable → accept a bounded re-fire rather than throw */
  }
}
function markPhaseReached(phase: number): void {
  const done = qsReached();
  if (done.includes(phase)) return;
  done.push(phase);
  qsSave(done);
  track('quickstart_phase_reached', { phase, method: 'success_check_dwell' });
  if (phase === QS_FINAL_PHASE) {
    track('quickstart_completed', { phases_reached: new Set(done).size, method: 'inferred' });
  }
}
function teardownQuickstartWatch(): void {
  // Invalidate the token FIRST, so any requestAnimationFrame still pending from a
  // superseded navigation bails instead of attaching an observer to the new page
  // and firing the wrong phase. This runs at the top of every real route change,
  // so it also covers navigations whose new route skips watchSuccessCheck or
  // early-returns (watchSuccessCheck then captures the post-teardown token).
  qsToken++;
  if (qsDwell) {
    clearTimeout(qsDwell);
    qsDwell = null;
  }
  if (qsObserver) {
    qsObserver.disconnect();
    qsObserver = null;
  }
}
/**
 * Watch a phase page's "### Success Check" heading and record the phase as
 * reached once it makes an ENTER transition into ≥60% view and stays there for
 * QS_DWELL_MS. Called from onRouteDidUpdate after each phase navigation;
 * teardownQuickstartWatch() drops the observer when the route next changes.
 */
function watchSuccessCheck(phase: number): void {
  if (typeof IntersectionObserver === 'undefined') return;
  if (qsReached().includes(phase)) return;
  const token = ++qsToken;
  // Defer one frame so the new route's DOM has committed before we query it.
  window.requestAnimationFrame(() => {
    if (token !== qsToken) return; // a newer navigation superseded this one
    const heading = document.getElementById('success-check');
    if (!heading) return; // page without the checklist heading → nothing to watch
    let first = true;
    const observer = new IntersectionObserver(
      (entries) => {
        // A stale observer (from a page we already left) must only disconnect
        // ITSELF — never the live one, or it would silently stop the new page.
        if (token !== qsToken) {
          observer.disconnect();
          return;
        }
        const entry = entries[0];
        if (!entry) return;
        // Ignore the heading already being visible on landing (deep-link /
        // #anchor / tall viewport): require a real scroll-in ENTER transition.
        if (first) {
          first = false;
          if (entry.isIntersecting) return;
        }
        if (entry.isIntersecting) {
          if (!qsDwell) {
            qsDwell = setTimeout(() => {
              markPhaseReached(phase);
              teardownQuickstartWatch();
            }, QS_DWELL_MS);
          }
        } else if (qsDwell) {
          clearTimeout(qsDwell);
          qsDwell = null;
        }
      },
      { threshold: 0.6 },
    );
    qsObserver = observer;
    observer.observe(heading);
  });
}

const clientModule: ClientModule = {
  // $pageleave on SPA navigation. posthog-js emits $pageleave ONLY on real DOM
  // unload (pagehide); its history_change autocapture fires only $pageview on
  // client-side route changes, so a docs SPA sends almost no $pageleave and Web
  // Analytics' bounce rate / session duration / pageleave health check stay
  // broken. We emit it ourselves for the page being LEFT, before the new route
  // renders (page still alive → reliable transport, unlike the lossy unload
  // beacon). Fires on push/replace/pop navigation via Docusaurus' router. The SDK
  // still additionally fires its own unload $pageleave on a genuine tab-close.
  onRouteUpdate({ location, previousLocation }) {
    if (!ENABLED) return;
    if (!previousLocation) return; // initial hard load: nothing left yet
    if (location.pathname === previousLocation.pathname) return; // same page (hash/query only)
    try {
      const ph = (window as unknown as {
        posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void };
      }).posthog;
      const prev = previousLocation;
      const prevUrl =
        window.location.origin + prev.pathname + (prev.search || '') + (prev.hash || '');
      // Explicit URL so the leave is attributed to the page being LEFT regardless
      // of ordering vs the SDK's history_change $pageview; before_send still scrubs
      // the URL and derives content_group from $pathname.
      ph?.capture?.('$pageleave', { $current_url: prevUrl, $pathname: prev.pathname });
    } catch {
      /* analytics must never break navigation */
    }
  },
  // Quick-start funnel: a phase-view per quick-start phase page, plus a read-only
  // watcher that fires quickstart_phase_reached when the reader reaches that
  // phase's Success-check checklist (see the helpers above). Pageviews themselves
  // are handled by capture_pageview:'history_change' (do NOT also fire $pageview
  // here, or every route change would double-count).
  onRouteDidUpdate({ location, previousLocation }) {
    if (!ENABLED) return;
    // Same pathname (hash/ToC/query only): keep the live watcher — a jump to
    // #success-check is a legitimate enter transition we still want to count.
    if (location.pathname === previousLocation?.pathname) return;
    teardownQuickstartWatch(); // drop any observer from the page we just left
    const rel = toRelative(location.pathname);
    // /guides/quick-start/ since 2026-08-15. This anchored regex matched nothing
    // between the IA restructure and that fix, so `quickstart_phase_view` never
    // fired and watchSuccessCheck() never armed — the whole Quick Start funnel was
    // dark, with no error to show for it. See the note on contentGroup() above.
    const m = /^\/guides\/quick-start\/phase-(\d+)/.exec(rel);
    if (m) {
      const phase = Number(m[1]);
      track('quickstart_phase_view', { phase });
      watchSuccessCheck(phase);
    } else if (rel.startsWith('/guides/get-oriented/what-you-need')) {
      track('quickstart_phase_view', { phase: 0 });
    }
  },
};

export default clientModule;

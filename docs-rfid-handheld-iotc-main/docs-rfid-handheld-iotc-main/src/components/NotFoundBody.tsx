/**
 * Shared body for every 404 surface in this site.
 *
 * Three places render this:
 *   1. src/pages/404.tsx              — wrapped in <Layout> → build/404.html (static host fallback)
 *   2. src/theme/NotFound/index.tsx   — wrapped in <Layout> → client-side router wildcard (* route)
 *   3. src/theme/NotFound/Content/index.tsx — bare, no Layout → DocRoot's internal NotFound
 *      (DocRoot is rendered inside its own Layout, so this path must NOT wrap in Layout
 *      again — see @docusaurus/theme-classic DocRoot index.tsx which imports
 *      @theme/NotFound/Content directly to avoid a double layout.)
 *
 * Implementation tracks /_meta/governance/site-rulebooks/404-PAGE.md sections 3a-3g. The dynamic bits
 * (attempted URL, referrer, "did you mean", prefilled report link) light up
 * after client-side hydration; the rest is server-rendered HTML.
 */

import React, { useEffect, useState } from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { PageMetadata } from '@docusaurus/theme-common';
import { track } from '@site/src/analytics/track';
import Icon from '@site/src/components/icons';
import styles from './NotFoundBody.module.css';

// Suggestions for known-deleted paths. When a visitor lands on one of
// these URLs, surface a "Did you mean" pointer (styleguide §6).
const DID_YOU_MEAN_EXACT: Record<string, string> = {
  '/resources/additional-reference/libraries': '/guides/core-concepts/mqtt-in-the-iot-connector',
};

const DID_YOU_MEAN_PREFIX: Array<[string, string]> = [
  // The entire /sdks/* section was deleted; any URL under it should
  // suggest the MQTT primer (the closest surviving concept).
  ['/sdks/', '/guides/core-concepts/mqtt-in-the-iot-connector'],
  ['/sdks', '/guides/core-concepts/mqtt-in-the-iot-connector'],
  // A-17 flattened the security/ and endpoints/ sub-folders out of
  // /infrastructure/. Those page URLs used to 301 and never reached this page;
  // since the redirect layer was removed on 2026-08-16 they land here like
  // everything else, which makes these prefix hints load-bearing rather than a
  // fallback for the ones the redirect table missed.
  ['/infrastructure/security/', '/guides/core-concepts/the-security-model'],
  ['/infrastructure/endpoints/', '/guides/core-concepts/endpoints-topics-and-channels'],
];

// Curated recovery jumps (styleguide §3e). Keep to 4-6 entries.
const RECOVERY_JUMPS: Array<{ label: string; to: string; description: string }> = [
  { label: 'Start here', to: '/guides/get-oriented', description: 'Where to begin in the docs' },
  { label: 'Quick Start tutorial', to: '/guides/quick-start', description: 'Read your first tag in 30 minutes' },
  { label: 'MQTT API', to: '/api-reference/mqtt', description: 'Index of every IOTC MQTT command and event' },
  { label: 'Something not working?', to: '/guides/diagnose-and-recover', description: 'Symptom-first failure index' },
];

// The 404's "Report broken link" affordance points at an INTERNAL
// page (src/pages/report-broken-link.tsx) — not GitHub Issues
// directly — so visitors without a GitHub account aren't blocked
// by a login wall. The internal page offers three submission
// channels (copy, email, GitHub issue) and pre-fills the URL +
// referrer from the query string.
const REPORT_BROKEN_LINK_PATH = '/report-broken-link';

function stripBaseUrl(path: string, baseUrl: string): string {
  if (baseUrl !== '/' && path.startsWith(baseUrl)) {
    return path.slice(baseUrl.length - (baseUrl.endsWith('/') ? 1 : 0));
  }
  return path;
}

function computeSuggestion(attemptedPath: string | null): string | null {
  if (!attemptedPath) return null;
  const normalised = attemptedPath.split('?')[0].split('#')[0].replace(/\/$/, '');
  if (DID_YOU_MEAN_EXACT[normalised]) {
    return DID_YOU_MEAN_EXACT[normalised];
  }
  for (const [prefix, target] of DID_YOU_MEAN_PREFIX) {
    if (normalised === prefix.replace(/\/$/, '') || normalised.startsWith(prefix)) {
      return target;
    }
  }
  return null;
}

function buildReportUrl(attempted: string | null, referrer: string | null): string {
  // Build a query string with the attempted URL and referrer pre-filled.
  // The /report-broken-link page reads these on mount and pre-populates
  // its form, so the visitor doesn't have to retype anything.
  const params = new URLSearchParams();
  if (attempted) params.set('url', attempted);
  if (referrer) params.set('referrer', referrer);
  const qs = params.toString();
  return qs ? `${REPORT_BROKEN_LINK_PATH}?${qs}` : REPORT_BROKEN_LINK_PATH;
}

// §7e analytics for the in-page GET form. Every search event in
// src/client-modules/posthog.ts keys on a `.DocSearch-*` selector (the navbar
// modal's DOM), and this form's classes are hashed CSS-module names, so the
// delegated listeners there cannot see it and it emitted nothing at all. Fired
// here, at the interaction, because this is a component we own — the same place
// DownloadPdfButton, /report-broken-link and DocItem/Footer fire theirs; the
// client module's listeners exist for third-party DOM and cross-route events.
//
// LENGTH ONLY, never the query text: custom props bypass the before_send scrub
// (see SCRUB_PARAMS in posthog.ts), and the analytics plan's §C.5 forbids raw
// query strings — `query_len` is the same property docsearch_query sends.
//
// track() is the one canonical entry point and is already inert when analytics
// is disabled (no POSTHOG_KEY → no window.posthog → no-op) and never throws.
// The event is NOT preventDefault-ed: the native GET submission must stay
// untouched, which means delivery is best-effort against the unload — the same
// trade already accepted for outbound_click_* and pdf_download.
function trackSearchSubmit(event: React.FormEvent<HTMLFormElement>): void {
  try {
    const field = new FormData(event.currentTarget).get('q');
    const query = typeof field === 'string' ? field.trim() : '';
    if (!query) return; // an empty submit is not a search
    track('not_found_search_submit', { query_len: query.length });
  } catch {
    /* a tracking failure must never interfere with the submission */
  }
}

export default function NotFoundBody(): React.JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const baseUrl = siteConfig.baseUrl ?? '/';
  const searchUrl = useBaseUrl('/search/');

  const [attempted, setAttempted] = useState<string | null>(null);
  const [referrer, setReferrer] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawPath = window.location.pathname + window.location.search;
    const trimmedPath = stripBaseUrl(rawPath, baseUrl);
    setAttempted(trimmedPath);
    setSuggestion(computeSuggestion(trimmedPath));

    if (document.referrer) {
      try {
        const ref = new URL(document.referrer);
        const sameOrigin = ref.origin === window.location.origin;
        setReferrer(
          sameOrigin
            ? stripBaseUrl(ref.pathname + ref.search, baseUrl)
            : ref.hostname + ref.pathname,
        );
      } catch {
        // Malformed referrer; ignore.
      }
    }

    // Fire a custom event so any analytics integration can capture the
    // 404 (styleguide §7e). gtag fallback included for sites that wire
    // up Google Analytics 4 later.
    window.dispatchEvent(
      new CustomEvent('zebra:404', {
        detail: {
          attemptedUrl: trimmedPath,
          rawPath,
          referrer: document.referrer || null,
        },
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gtag = (window as any).gtag;
    if (typeof gtag === 'function') {
      gtag('event', 'page_not_found', {
        attempted_url: trimmedPath,
        referrer: document.referrer || '(none)',
      });
    }
  }, [baseUrl]);

  const reportUrl = buildReportUrl(attempted, referrer);

  return (
    <main className={styles.notFoundMain}>
      {/* §7b: the title and robots=noindex are emitted from the BODY, not from
          the wrappers, because the surface that actually answers an in-app 404
          is src/theme/NotFound/Content — DocRoot imports it directly, and it is
          frozen bare by zebra-design-system.md §12.20(5), so it can never set a
          head of its own. Emitting here covers all three surfaces with one
          declaration. Before this, 29 of 30 probed in-app 404s carried the site
          title and NO robots meta at all.

          The identical declarations on src/pages/404.tsx and
          src/theme/NotFound/index.tsx do NOT double up: react-helmet keeps only
          the innermost writer of a repeated <title> or a repeated name=/property=
          meta, and this body renders inside those wrappers, so it is the
          innermost writer. Duplication is only possible inside a SINGLE <Head>;
          PageMetadata puts children in their own <Head>, so that cannot happen
          here. PageMetadata (not a raw <Head><title>) so the site's title
          formatter runs and og:title/og:description come for free. `image` is
          this page's own card from social-cards-manifest.json, written out in
          full because lint-static-orphans.mjs finds an asset only by its file
          name. */}
      <PageMetadata
        title="Page Not Found"
        description="The URL you requested isn't part of this documentation."
        image="/img/social/404.png"
      >
        <meta name="robots" content="noindex" />
      </PageMetadata>

      <div className={styles.container}>
        {/* §3a Status acknowledgement */}
        <div className={styles.statusBlock}>
          <div className={styles.statusCode} aria-hidden="true">404</div>
          <h1 className={styles.title}>This Page Doesn't Exist</h1>
          <p className={styles.subtitle}>
            The URL you requested isn't part of this documentation.
          </p>
        </div>

        {/* §3b Diagnostics strip */}
        <div className={styles.diagnostics} role="status" aria-live="polite">
          {attempted ? (
            <p className={styles.diagnosticsLine}>
              <span className={styles.diagnosticsLabel}>You tried:</span>{' '}
              <code className={styles.urlCode}>{attempted}</code>
            </p>
          ) : null}
          {referrer ? (
            <p className={styles.diagnosticsLine}>
              <span className={styles.diagnosticsLabel}>You arrived from:</span>{' '}
              <code className={styles.urlCode}>{referrer}</code>
            </p>
          ) : null}
          <p className={styles.diagnosticsMeta}>HTTP 404 · noindex</p>
        </div>

        {/* §6 "Did you mean" suggestion (only when a target exists) */}
        {suggestion ? (
          <div className={styles.didYouMean}>
            <p>
              Did you mean:{' '}
              <Link to={suggestion} className={styles.suggestionLink}>
                <code>{suggestion}</code>
              </Link>
              ?
            </p>
          </div>
        ) : null}

        {/* §3c What likely happened */}
        <section className={styles.section} aria-labelledby="whyHeading">
          <h2 id="whyHeading" className={styles.sectionTitle}>
            A Few Things That May Have Happened
          </h2>
          <ul className={styles.reasonList}>
            <li>The page was renamed or retired during a documentation refactor.</li>
            <li>You mistyped part of the URL.</li>
            <li>A link from another site is out of date.</li>
          </ul>
        </section>

        {/* §3d Search */}
        <section className={styles.section} aria-labelledby="searchHeading">
          <h2 id="searchHeading" className={styles.sectionTitle}>
            Search the documentation
          </h2>
          <form
            method="get"
            action={searchUrl}
            className={styles.searchForm}
            role="search"
            aria-label="Search the documentation"
            onSubmit={trackSearchSubmit}
          >
            <input
              type="search"
              name="q"
              placeholder="Search the documentation"
              aria-label="Search the documentation"
              className={styles.searchInput}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <button type="submit" className={styles.searchButton}>
              Search
            </button>
          </form>
          {/* The sentence that used to sit here — "Or use the search box in the
              navigation bar above." — is deliberately gone. It pointed at the
              navbar's DocSearch control, which is a separate entry point that
              needs no signpost from inside the page; deleting the sentence
              removes no search affordance, because both the form above and the
              navbar control remain. Its .searchHint rule was deleted with it
              rather than left orphaned in the stylesheet. */}
          {/* Honest degradation without JavaScript (404-PAGE.md §9, §11).
              The form's target — /search/ — is Algolia's client SDK: it fetches
              inside a useEffect and its input is controlled by the query string,
              so with scripting off a submit lands on a page that shows an empty
              box and zero results and does not even echo the query back
              (measured in build/search/index.html). Rather than leave a control
              that looks alive, the block below hides the form and states the
              truth. It is a <noscript>, so the BROWSER guarantees it applies
              only when no script runs — a hydration-time check could never run
              in the case it targets, and an @media (scripting: none) rule would
              need this notice in the DOM unconditionally, which in a browser
              without that feature would tell a JavaScript-enabled reader that
              JavaScript is off.

              Safe in all three render paths, verified against react-dom 19:
              Fizz emits a <style> inside a noscript IN PLACE instead of
              hoisting it to <head> (noscriptTagInScope), while on the client
              shouldSetTextContent() is true for 'noscript', so React never
              creates these children — the client-rendered 404 surfaces get an
              empty noscript, and hydration leaves the server's markup alone
              without a mismatch warning. Hence JSX children and NOT
              dangerouslySetInnerHTML, which would set innerHTML on a
              client-only mount.

              The noscript rule below is an ELEMENT selector on purpose: the UA
              rule noscript{display:none} carries no !important, so the same
              declaration in the CSS module would out-rank it and paint this
              markup as raw text for readers who DO have JavaScript. */}
          <noscript>
            <style>{`noscript{display:block}.${styles.searchForm}{display:none}`}</style>
            <p className={styles.noJsNotice}>
              Search needs JavaScript, which is turned off in this browser. The
              recovery links below still work, as do the links in the navigation
              bar.
            </p>
          </noscript>
        </section>

        {/* §3e Curated recovery jumps */}
        <section className={styles.section} aria-labelledby="jumpsHeading">
          <h2 id="jumpsHeading" className={styles.sectionTitle}>
            Or Jump to One of These
          </h2>
          <ul className={styles.jumpsList}>
            {RECOVERY_JUMPS.map((jump) => (
              <li key={jump.to} className={styles.jumpItem}>
                <Link to={jump.to} className={styles.jumpLink}>
                  {/* Was `content: '▸'` on `.jumpLink::before`. A generated character cannot
                      take a stroke weight, so it drew a FILLED triangle on a page whose only
                      other marks are 1.8px outlines; it also fell back to whatever face the
                      platform had for U+25B8. `Advance` is this system's name for exactly this
                      mark — "this row goes somewhere" — and is already the glyph on the
                      landing page's rows. */}
                  <Icon name="Advance" size={16} className={styles.jumpIcon} />
                  <span className={styles.jumpLabel}>{jump.label}</span>
                  <span className={styles.jumpDescription}>{jump.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* §3f Report broken link — opens internal /report-broken-link
            page in the same tab (not GitHub, which would gate visitors
            behind a login wall). */}
        <section className={styles.reportSection}>
          <p>
            Think this URL should resolve?{' '}
            <Link to={reportUrl} className={styles.reportLink}>
              Report broken link
              <Icon name="Advance" size={15} className={styles.reportIcon} />
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

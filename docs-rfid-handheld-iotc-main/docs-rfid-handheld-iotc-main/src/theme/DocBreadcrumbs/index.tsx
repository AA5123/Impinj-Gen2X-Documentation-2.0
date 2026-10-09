/**
 * Swizzled @theme/DocBreadcrumbs — the trail above every doc page's title.
 *
 * NOT A BYTE-IDENTICAL EJECT ANY MORE, as of 2026-09-06; the header that said so is gone with
 * the property it described. Still verbatim from
 * `@docusaurus/theme-classic/src/theme/DocBreadcrumbs/index.tsx` (v3.10.2): `BreadcrumbsItem`,
 * both `TODO` comments, the `<nav>`/`<ul>` shape, the `styles` import, and the
 * `if (!…) return null` guard. Ours: the section ancestors, the word "Home", `aria-current`,
 * and two extra props on `BreadcrumbsItemLink`. Upstream's Prettier settings
 * (`bracketSpacing: false`, `bracketSameLine: true`) are still preserved, which differ from this
 * repo's `.prettierrc.json` — kept so the parts that are still verbatim keep diffing cleanly on
 * a Docusaurus upgrade.
 *
 * ── 1. THE SECTION ANCESTORS CANNOT COME FROM THE SIDEBAR ───────────────────────────────────
 *
 * `useSidebarBreadcrumbs()` walks ONE sidebar looking for the current pathname
 * (@docusaurus/plugin-content-docs lib/client/docsUtils.js), and this site runs three docs
 * plugin instances with five sidebars between them. So the trail it returns starts at the top of
 * whichever tree the reader is in, and the section that tree BELONGS to is never in it. Measured
 * on the dev server 2026-09-06, before this change, across all 230 routes that render this nav:
 *
 *     /guides/, /resources/, /api-reference/    [home icon]              (array empty)
 *     /api-reference/mqtt/mgmt/get-eth/         [home icon] > Management > Network Configuration > get_eth
 *
 * — no "Guides", no "API Reference", no "MQTT API" anywhere. The three section index pages also
 * shipped `"itemListElement": []`, a BreadcrumbList describing nothing.
 *
 * THE ANCESTORS COME FROM THE SIDEBAR'S NAME, NOT FROM THE PATHNAME. `useDocsSidebar()` returns
 * the tree the page is rendering with, and its five names are unique site-wide — `docs`,
 * `resources` and `apiIndex` on the main instance, `api-mqtt` and `api-rest` on the other two —
 * so the name identifies the section where the plugin id cannot: `useActivePlugin()` answers
 * 'default' for /guides/**, /resources/** AND /api-reference/ alike, because one instance serves
 * all three. A prefix table over `useLocation().pathname` would also work and was rejected: it
 * restates the `routeBasePath` strings a fourth time (they already live in docusaurus.config.ts,
 * in the sidebars, and in scripts/site/generate-pdfs.mjs) and it needs longest-prefix ordering to
 * stop /api-reference/mqtt matching /api-reference first. A name is a lookup with no ordering to
 * get wrong. Titles and hrefs come from src/components/siteSections.ts — the same map the sidebar
 * panel header prints from, so a crumb that disagrees with the panel title one column to its left
 * is not expressible. An unmapped sidebar prepends nothing, matching what the panel header does
 * with that map: a sixth tree added without a row there keeps the old trail rather than getting
 * an invented ancestor.
 *
 * THE DUPLICATE-HREF FILTER IS NOT DEFENSIVE — IT FIXES A REAL COLLISION. Both API references
 * open with a sidebar CATEGORY labelled "Overview" whose `link` is the instance's own index doc
 * (sidebars/api-mqtt.ts, sidebars/api-rest.ts), so its href IS the section root. Measured: 12
 * routes' trails pass through those two Overviews, and prepending blind would have printed
 * `API Reference > MQTT API > Overview` with two crumbs on one URL — and on /api-reference/mqtt/
 * and /api-reference/rest/ themselves the second-to-last crumb would have linked to the page the
 * reader is already standing on. Keeping the FIRST of any two crumbs with the same href keeps the
 * ancestor's label, which is the one the navbar and the panel header also use, and drops the echo.
 * Items with no href are never candidates and always pass.
 *
 * ── 2. THE HOME CRUMB IS DRAWN HERE, NOT BY @theme/DocBreadcrumbs/Items/Home ────────────────
 *
 * That component renders `<li><Link><IconHome/></Link></li>` — measured as the one `<svg>` inside
 * this nav on each of the 230 pages. The brief asks for the word "Home" and for no icons in the
 * trail at all, so the SVG has to leave the DOM rather than be hidden, which leaves nothing of it
 * to keep. Swizzling it instead would keep an `<li>` whose `<Link>` has no inner `<span>`, so the
 * first crumb's DOM would differ from every other crumb's and src/css would need an exception for
 * it. Upstream's `useHomePageRoute()` guard is kept: no home page, no home crumb.
 *   `aria-label="Home page"` and its translation id `theme.docs.breadcrumbs.home` are kept
 * verbatim, so the accessible name that shipped with the icon does not change — and it now
 * contains the visible word, which is what WCAG 2.5.3 (Label in Name) asks and an icon could not
 * offer. The visible word is a plain string, like every other IA label on this single-locale
 * site; inventing an id under the `theme.` namespace, which upstream owns, is the riskier option.
 *
 * ── 3. `aria-current="page"` GOES ON THE LINK, AND ONLY WHEN IT IS TRUE ─────────────────────
 *
 * Measured before this change: zero `aria-current` attributes across all 230 pages — upstream
 * marks the last crumb with `.breadcrumbs__item--active` on the `<li>` and nothing else, so the
 * one cue that says "this crumb is where you are" was missing for assistive technology. It goes on
 * the `<span class="breadcrumbs__link">` rather than on the `<li>` because that is the element
 * carrying the accessible name — and, as a side effect worth knowing before anyone moves it, it
 * puts `.breadcrumbs__link[aria-current="page"]` at (0,2,0), the same specificity as Infima's
 * `.breadcrumbs__item--active .breadcrumbs__link`, so a stylesheet can select the current crumb
 * either way. src/css/custom.scss currently uses the class.
 *   `isLast` ALONE IS NOT A SAFE TEST FOR "IS THE CURRENT PAGE", which is why the pathname
 * comparison below exists. A page that renders with a sidebar but is absent from that sidebar's
 * items gets `[]` from `useSidebarBreadcrumbs()` — the three section index pages are exactly that
 * shape — so the last crumb can be a prepended SECTION crumb. Where that crumb IS the page (all
 * three of them) the mark is right; where it is not, `aria-current` would announce a crumb whose
 * URL is elsewhere as the current page. So it is emitted only when the last crumb has no URL of
 * its own, or its URL is this one. Verified after the change: exactly one `aria-current="page"`,
 * on the right element, on each of the 230 routes.
 *   IF BOTH ARRAYS ARE EMPTY the trail is "Home" alone and carries no `aria-current`, because no
 * crumb is this page. No route reaches that after this change; it is left fail-open rather than
 * marking the Home link, which points somewhere else.
 *
 * ── 4. THE STRUCTURED DATA IS FED THE SAME ARRAY, AND THAT IS LOAD-BEARING ──────────────────
 *
 * `<DocBreadcrumbsStructuredData>` emits the `BreadcrumbList` JSON-LD that all 230 doc pages
 * carry. It is rendered first, from `breadcrumbs` — the SAME concatenated, de-duplicated array the
 * <nav> maps over, not from `useSidebarBreadcrumbs()` — so the visible trail and the structured
 * data cannot drift apart. Do not fold it into the <nav>, do not make it conditional, and do not
 * let an early return skip it: the `if (!sidebarBreadcrumbs) return null` guard below is
 * upstream's and covers both together, which is correct — no breadcrumbs means no list to describe.
 *   THE HOME CRUMB IS NOT IN THAT ARRAY, and the asymmetry is upstream's, kept on purpose.
 * `useBreadcrumbsStructuredData` DROPS every item with no href and turns the rest into ListItems
 * (plugin-content-docs lib/client/structuredDataUtils.js), and upstream renders home OUTSIDE the
 * array precisely so the site root does not become position 1 of every published BreadcrumbList.
 * The observable invariant, true before this change and after it: the list is exactly one shorter
 * than the visible trail — home missing from the front, and the active crumb, which has an href in
 * the array but renders as a `<span>`, still in it.
 */
import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {ThemeClassNames} from '@docusaurus/theme-common';
import {
  useDocsSidebar,
  useSidebarBreadcrumbs,
} from '@docusaurus/plugin-content-docs/client';
import type {PropSidebarBreadcrumbsItem} from '@docusaurus/plugin-content-docs';
import {useHomePageRoute} from '@docusaurus/theme-common/internal';
import Link from '@docusaurus/Link';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';
import {useLocation} from '@docusaurus/router';
import {translate} from '@docusaurus/Translate';
import DocBreadcrumbsStructuredData from '@theme/DocBreadcrumbs/StructuredData';
import {sectionTrail} from '@site/src/components/siteSections';

import styles from '@docusaurus/theme-classic/lib/theme/DocBreadcrumbs/styles.module.css';

/* Docusaurus serves /guides/ while a doc permalink is /resources/glossary, so every comparison
   between two of this site's URLs has to be slash-insensitive. `/` itself is never trimmed. */
const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p);

// TODO move to design system folder
function BreadcrumbsItemLink({
  children,
  href,
  isLast,
  isCurrentPage,
  ariaLabel,
}: {
  children: ReactNode;
  href: string | undefined;
  isLast: boolean;
  isCurrentPage?: boolean;
  ariaLabel?: string;
}): ReactNode {
  const className = 'breadcrumbs__link';
  if (isLast) {
    return (
      <span
        className={className}
        aria-current={isCurrentPage ? 'page' : undefined}>
        {children}
      </span>
    );
  }
  /* `ariaLabel` is undefined for every crumb but Home, and React omits an undefined attribute —
     so the other crumbs render exactly the markup upstream renders. */
  return href ? (
    <Link className={className} href={href} aria-label={ariaLabel}>
      <span>{children}</span>
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}

// TODO move to design system folder
function BreadcrumbsItem({
  children,
  active,
}: {
  children: ReactNode;
  active?: boolean;
}): ReactNode {
  return (
    <li
      className={clsx('breadcrumbs__item', {
        'breadcrumbs__item--active': active,
      })}>
      {children}
    </li>
  );
}

export default function DocBreadcrumbs(): ReactNode {
  const sidebarBreadcrumbs = useSidebarBreadcrumbs();
  /* Safe without a try: `useSidebarBreadcrumbs()` above calls this same hook, so wherever this
     component renders at all, DocsSidebarProvider is present. */
  const sidebar = useDocsSidebar();
  const homePageRoute = useHomePageRoute();
  const {withBaseUrl} = useBaseUrlUtils();
  const {pathname} = useLocation();

  if (!sidebarBreadcrumbs) {
    return null;
  }

  /* The section ancestors, root first, built as ordinary sidebar LINK items so that the <nav>
     below and <DocBreadcrumbsStructuredData> can treat them exactly like the sidebar's own
     crumbs. `withBaseUrl` rather than the `useBaseUrl` hook because this runs inside a map;
     both call the same `addBaseUrl`, which is idempotent, so `<Link>` re-prefixing the result
     is a no-op. Nothing is done to the trailing slash here — `<Link>` canonicalises the
     rendered href itself; see siteSections.ts for the rest of that argument. */
  const sectionCrumbs = sectionTrail(sidebar?.name).map(
    (section): PropSidebarBreadcrumbsItem => ({
      type: 'link',
      label: section.title,
      href: withBaseUrl(section.href),
    }),
  );

  /* One crumb per URL, first occurrence wins — see the "Overview" collision in the header. */
  const seenHrefs = new Set<string>();
  const breadcrumbs = [...sectionCrumbs, ...sidebarBreadcrumbs].filter(
    (item) => {
      if (!item.href) {
        return true;
      }
      const key = trimSlash(item.href);
      if (seenHrefs.has(key)) {
        return false;
      }
      seenHrefs.add(key);
      return true;
    },
  );

  /* Does the last crumb actually point at this page? See section 3 of the header for the case
     where it does not. An empty trail has no last crumb and nothing to mark. */
  const lastHref = breadcrumbs[breadcrumbs.length - 1]?.href;
  const lastIsCurrentPage =
    breadcrumbs.length > 0 &&
    (!lastHref || trimSlash(lastHref) === trimSlash(pathname));

  return (
    <>
      <DocBreadcrumbsStructuredData breadcrumbs={breadcrumbs} />
      <nav
        className={clsx(
          ThemeClassNames.docs.docBreadcrumbs,
          styles.breadcrumbsContainer,
        )}
        aria-label={translate({
          id: 'theme.docs.breadcrumbs.navAriaLabel',
          message: 'Breadcrumbs',
          description: 'The ARIA label for the breadcrumbs',
        })}>
        <ul className="breadcrumbs">
          {homePageRoute && (
            <BreadcrumbsItem>
              <BreadcrumbsItemLink
                href={withBaseUrl('/')}
                isLast={false}
                ariaLabel={translate({
                  id: 'theme.docs.breadcrumbs.home',
                  message: 'Home page',
                  description:
                    'The ARIA label for the home page in the breadcrumbs',
                })}>
                Home
              </BreadcrumbsItemLink>
            </BreadcrumbsItem>
          )}
          {breadcrumbs.map((item, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            const href =
              item.type === 'category' && item.linkUnlisted
                ? undefined
                : item.href;
            return (
              <BreadcrumbsItem key={idx} active={isLast}>
                <BreadcrumbsItemLink
                  href={href}
                  isLast={isLast}
                  isCurrentPage={isLast && lastIsCurrentPage}>
                  {item.label}
                </BreadcrumbsItemLink>
              </BreadcrumbsItem>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

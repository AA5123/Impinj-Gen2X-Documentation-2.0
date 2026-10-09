import React, { type ReactNode } from 'react';
import clsx from 'clsx';
import { translate } from '@docusaurus/Translate';
import { useAnchorTargetClassName } from '@docusaurus/theme-common';
import Link from '@docusaurus/Link';
import useBrokenLinks from '@docusaurus/useBrokenLinks';
import { useLocation } from '@docusaurus/router';
import type { Props } from '@theme/Heading';
import './styles.module.css';
import CopyPageButton from '@site/src/components/CopyPageButton';
import DownloadPdfButton from '@site/src/components/DownloadPdfButton';
import useRouteKind from './useRouteKind';
import PageMeta from '@site/src/components/PageMeta';
import useIsHubPage from './useIsHubPage';

/**
 * The "Copy page" control, gated on the page having no child items.
 *
 * A COMPONENT AND NOT AN `if`, because useIsHubPage() calls useDoc() and a hook may not run
 * inside a conditional branch of Heading — Heading returns early for h1, and React's hook order
 * has to be identical on every render of the same component. Wrapping the call in its own
 * component gives it an unconditional position in a render that only happens on a docs route,
 * which is exactly where useDoc() has a context to read.
 */
function CopyPageAction(): ReactNode {
  const isHub = useIsHubPage();
  return isHub ? null : <CopyPageButton />;
}

export default function Heading({ as: As, id, ...props }: Props): ReactNode {
  const brokenLinks = useBrokenLinks();
  const anchorTargetClassName = useAnchorTargetClassName(id);
  const { pathname } = useLocation();
  // Generated-index landing pages are auto-built navigation grids with no authored
  // prose — there is nothing to copy or print, so the page-action row is suppressed
  // there and kept on every authored route. useRouteKind answers this from the
  // framework's own id contract; see the comment on the hook for the invariant and
  // for why the pathname regex this replaced could not be made correct.
  const routeKind = useRouteKind();
  const isGeneratedIndex = routeKind === 'generated-index';
  // The 24 command/event API-reference pages (single segment under a group) — exactly
  // the .mdx files under api/mqtt/reference/{mgmt,ctrl,events,data}, which is also the set
  // scripts/site/generate-pdfs.mjs builds a per-page PDF for (see its GROUPS/.mdx filter).
  // Re-counted 2026-08-08: mgmt 15 + ctrl 5 + events 3 + data 1 = 24.
  // Deriving this from the built route list is safe again as of 2026-08-16: the six
  // extra directories that used to sit under these prefixes were redirect stubs, and the
  // redirect layer is gone, so the route list and the .mdx set now agree. (Counting those
  // stubs is what produced the stale "29" in the 2026-08 UI audit.) The .mdx set is still
  // the better source, because it is the same one generate-pdfs.mjs scopes itself by.
  // NOTE: useLocation().pathname INCLUDES the site baseUrl, so these are substring
  // (not ^-anchored) matches.
  // FOLLOW-ON, recorded not fixed: these two are still URL regexes, and they carry the
  // same fragility the generated-index regex did — they encode a route-naming convention
  // that nothing enforces, so a renamed group silently drops the PDF links. Unlike the
  // route kind above there is no framework fact to ask; the durable answer is a composed
  // page-actions slot the API-reference page template opts into and populates itself,
  // rather than this component guessing from a URL which actions a page wants.
  // REBASED 2026-08-16. These matched `/reference/<group>/<op>/` until the api-mqtt instance
  // took `routeBasePath: 'api-reference/mqtt'`, after which BOTH tests were permanently false
  // and every PDF button silently stopped rendering — the exact failure the FOLLOW-ON note
  // above predicted. Nothing broke loudly: the build passed, the PDFs were still generated,
  // and the only symptom was two absent buttons.
  const isApiRefPage = /\/api-reference\/mqtt\/(mgmt|ctrl|events|data)\/[^/]+\/?$/.test(pathname);
  // The API-reference index page (gets the consolidated "full" PDF).
  // `api-overview.mdx` carries `slug: '/'`, so the overview IS the instance root — there is no
  // longer an `/api-overview` segment to match.
  const isApiOverview = /\/api-reference\/mqtt\/?$/.test(pathname);

  // H1 headings do not need an id because they don't appear in the TOC.
  if (As === 'h1' || !id) {
    return (
      <>
        {As === 'h1' ? (
          <>
            <div className="custom-h1-wrapper">
              <As {...props} id={undefined} />
              {!isGeneratedIndex && (
                <div className="h1-actions">
                  {isApiRefPage && <DownloadPdfButton kind="page" />}
                  {isApiOverview && <DownloadPdfButton kind="full" />}
                  {/* "Copy page" is suppressed on a page WITH CHILD ITEMS — owner instruction,
                      2026-09-10. Those 50 pages are navigation: a heading, a sentence of framing
                      and a grid of links. Copying one yields the sentence and a list of titles,
                      which is not the page and is of no use to the LLM the control exists for.
                      Rendered through a child component because the predicate needs useDoc() and
                      a hook cannot be called inside this branch — see PageActions below. */}
                  {routeKind === 'doc' ? <CopyPageAction /> : <CopyPageButton />}
                </div>
              )}
            </div>
            {/* M1 — the Diátaxis chip and the metadata line, read from front matter.
                Gated on routeKind === 'doc' because PageMeta calls useDoc(), which throws
                outside a docs route; the gate is on the ELEMENT and not inside the component,
                so the hook is only ever called where its context exists.
                A page with neither `doc_type` nor `page_meta` renders nothing, which is how
                the 50 pages that have child items are excluded — the owner's rule is that the
                meta line goes on every page EXCEPT those, and they carry hub cards instead. */}
            {routeKind === 'doc' && <PageMeta />}
          </>
        ) : (
          <As {...props} id={undefined} />
        )}
      </>
    );
  }

  brokenLinks.collectAnchor(id);

  const anchorTitle = translate(
    {
      id: 'theme.common.headingLinkTitle',
      message: 'Direct link to {heading}',
      description: 'Title for link to heading',
    },
    {
      heading: typeof props.children === 'string' ? props.children : id,
    },
  );

  return (
    <As
      {...props}
      className={clsx('anchor', anchorTargetClassName, props.className)}
      id={id}>
      {props.children}
      <Link
        className="hash-link"
        to={`#${id}`}
        aria-label={anchorTitle}
        title={anchorTitle}
        translate="no">
        &#8203;
      </Link>
    </As>
  );
}

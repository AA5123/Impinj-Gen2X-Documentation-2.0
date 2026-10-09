/**
 * P4 · PROGRESS-AWARE PAGINATION.
 *
 * The stock paginator renders two links. P4 adds one thing above them — the reader's position
 * in the sequence they are working through — and that number is the entire reason this file
 * exists: it is not available to CSS, and it is not in the paginator's own props.
 *
 * WHERE THE NUMBER COMES FROM. `useCurrentSidebarSiblings()` returns the items of the deepest
 * sidebar category containing this page (falling back to the sidebar's top level when the page
 * is in no category). The current page's index in that list, counted over LINKABLE items only,
 * is "3"; the length is "8". Both come from the sidebar the reader can see beside them, so the
 * count can never disagree with the tree it describes.
 *
 * WHEN IT IS NOT DRAWN, which is the half of this design that is easy to skip:
 *
 *   - THERE IS NO ENCLOSING CATEGORY. The fallback to the sidebar root means a top-level page
 *     would otherwise report itself as "2 of 15" of an entire section — a number describing a
 *     list the reader is not walking.
 *   - THE CATEGORY HAS FEWER THAN THREE ITEMS. "1 of 2" tells a reader nothing they cannot see
 *     from the two cards directly below it.
 *   - THE CURRENT PAGE IS NOT IN THE LIST. A page reached through `displayed_sidebar` sits
 *     beside a tree it is not part of; there is no position to report.
 *
 * That restraint is the presented design's own note on P4 — a progress bar on a reference page
 * whose neighbours are alphabetical is a claim that the pages are ordered, and on this site
 * most of them are not. The bar is therefore an assertion about content shape, and it is made
 * only where the sidebar supports it.
 */
import React, { type ReactNode } from 'react';
import clsx from 'clsx';
import { useLocation } from '@docusaurus/router';
import Translate, { translate } from '@docusaurus/Translate';
import {
  useCurrentSidebarSiblings,
  useDocsSidebar,
  useSidebarBreadcrumbs,
} from '@docusaurus/plugin-content-docs/client';
import PaginatorNavLink from '@theme/PaginatorNavLink';
import type { Props } from '@theme/DocPaginator';
import styles from './styles.module.css';

/** The fewest items a list needs before "N of M" says more than the two cards below it do. */
const MIN_SEQUENCE = 3;

/** Trailing slashes differ between the router's pathname and a sidebar item's href. */
const samePath = (a?: string, b?: string): boolean =>
  !!a && !!b && a.replace(/\/$/, '') === b.replace(/\/$/, '');

function useSequence(): { section: string; index: number; total: number } | null {
  const { pathname } = useLocation();
  const siblings = useCurrentSidebarSiblings();
  const sidebar = useDocsSidebar();
  const breadcrumbs = useSidebarBreadcrumbs();

  // No enclosing category — `useCurrentSidebarSiblings` fell back to the sidebar root.
  if (!breadcrumbs?.length || siblings === sidebar?.items) return null;

  const linkable = siblings.filter(
    (item) => item.type === 'link' || (item.type === 'category' && !!item.href),
  );
  if (linkable.length < MIN_SEQUENCE) return null;

  // The ternary is on the TYPE and not on the property, because `href` is only declared on
  // the link and category members of PropSidebarItem — the `html` member has none, and a
  // single `item.href` therefore does not narrow.
  const index = linkable.findIndex((item) =>
    samePath(pathname, item.type === 'html' ? undefined : item.href),
  );
  if (index < 0) return null;

  const category = breadcrumbs[breadcrumbs.length - 1];
  return { section: category?.label ?? '', index: index + 1, total: linkable.length };
}

export default function DocPaginator(props: Props): ReactNode {
  const { className, previous, next } = props;
  const seq = useSequence();

  // THE className GOES ON THE GROUP, NOT ON THE <nav> — corrected 2026-09-10 at the owner's
  // report that "the progress-aware bar on top is way up there".
  //
  // It was. DocItem/Paginator passes `className="docusaurus-mt-lg"`, which is a 3rem top margin,
  // and the first version of this component put it on the <nav> while leaving the progress block
  // outside as a bare sibling. So the 3rem opened up BETWEEN the bar and the cards it describes,
  // and the bar floated up against whatever preceded it — the feedback widget — where it read as
  // that widget's caption rather than as the pagination's own.
  // The wrapper takes the margin, the bar sits 0.75rem above the cards, and the three parts read
  // as one group, which is what the presented P4 shows.
  return (
    <div className={clsx(className, styles.paginatorGroup)}>
      {seq && (
        // aria-hidden, and the reason is that this is a RESTATEMENT. The position it reports is
        // already in the sidebar's own list and in the two links below; announcing "3 of 8" as
        // a third copy adds noise to a screen reader without adding a fact. The visual is a
        // scanning aid, which is a channel assistive technology does not need served twice.
        <div className="pagination-progress" aria-hidden="true">
          <div className="pagination-progress__row">
            <span className="pagination-progress__section">{seq.section}</span>
            <span className="pagination-progress__count">
              {seq.index} of {seq.total}
            </span>
          </div>
          <div className="pagination-progress__track">
            <i
              className="pagination-progress__fill"
              style={{ width: `${(seq.index / seq.total) * 100}%` }}
            />
          </div>
        </div>
      )}
      <nav
        className="pagination-nav"
        aria-label={translate({
          id: 'theme.docs.paginator.navAriaLabel',
          message: 'Docs pages',
          description: 'The ARIA label for the docs pagination',
        })}>
        {previous && (
          <PaginatorNavLink
            {...previous}
            subLabel={
              <Translate
                id="theme.docs.paginator.previous"
                description="The label used to navigate to the previous doc">
                Previous
              </Translate>
            }
          />
        )}
        {next && (
          <PaginatorNavLink
            {...next}
            subLabel={
              <Translate
                id="theme.docs.paginator.next"
                description="The label used to navigate to the next doc">
                Next
              </Translate>
            }
            isNext
          />
        )}
      </nav>
    </div>
  );
}

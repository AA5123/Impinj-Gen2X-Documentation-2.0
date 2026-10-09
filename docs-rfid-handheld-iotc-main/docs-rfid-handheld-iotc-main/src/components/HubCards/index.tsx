/**
 * HUB CARDS — the icon-and-text grid that replaces a hand-written list of child pages.
 *
 * H1, applied site-wide 2026-09-09. Every page that HAS CHILD ITEMS carries one of these and
 * no page-meta line; every page that does not carries the meta line and no grid. That split is
 * the owner's rule, and it is the reason both halves were converted in one pass.
 *
 * WHY THIS WRAPPER EXISTS AT ALL, when `<DocCardList />` is already registered in
 * MDXComponents and would cover 49 of the 50 pages on its own.
 *
 *   `DocCardList` with no `items` calls `useCurrentSidebarSiblings()`, which walks the
 *   sidebar breadcrumbs to the DEEPEST CATEGORY containing the current page and returns its
 *   items — falling back to the sidebar's own top level when the page sits in no category at
 *   all. That fallback is exactly right for /guides/ and /resources/, whose landing pages are
 *   reached through `displayed_sidebar` and are in nobody's category, so both get their ten
 *   and six sections respectively with no help from us.
 *
 *   It is wrong for ONE page. /api-reference/mqtt/ is itself the `link` of the MQTT sidebar's
 *   "Overview" category, so the breadcrumb walk finds Overview and returns its four children —
 *   while the page is the directory for the whole reference and its table listed all ten
 *   top-level sections. Rendering four where the author wrote ten is a silent content loss,
 *   and it is the kind that no build check would catch.
 *
 * So `scope` is a two-value prop and the second value has one call site, named where the
 * ambiguity actually is rather than papered over by restructuring the sidebar around it:
 *
 *   <HubCards />                  the current category's children — the default, 49 pages
 *   <HubCards scope="section" />  the sidebar's top level — /api-reference/mqtt/ only
 *
 * Everything downstream is stock: this renders `@theme/DocCardList` with an explicit `items`,
 * so the two-column tile layout in src/theme/DocCard/Layout and the emoji-to-Lucide mask map
 * in src/css/cards.scss apply here exactly as they do anywhere else.
 */
import React, { type ReactNode } from 'react';
import {
  useCurrentSidebarSiblings,
  useDocsSidebar,
} from '@docusaurus/plugin-content-docs/client';
import DocCardList from '@theme/DocCardList';

interface Props {
  /** `category` (default) — this page's own children. `section` — the sidebar's top level. */
  scope?: 'category' | 'section';
  className?: string;
}

export default function HubCards({ scope = 'category', className }: Props): ReactNode {
  // BOTH HOOKS RUN ON EVERY RENDER, and the branch picks between their results afterwards.
  // Calling one inside an `if` would break the rules of hooks the first time a page changed
  // its own scope, and `useDocsSidebar()` is a context read with no cost worth avoiding.
  const siblings = useCurrentSidebarSiblings();
  const sidebar = useDocsSidebar();
  const items = scope === 'section' ? (sidebar?.items ?? siblings) : siblings;
  return <DocCardList items={items} className={className} />;
}

import React from 'react';
import MDXComponents from '@theme-original/MDXComponents';
import MDXA, { type Props as MDXAProps } from '@theme/MDXComponents/A';
/* H1, 2026-09-09 — the section-hub card grid, on all 50 pages that have child items.
 * Registered here rather than imported in each of them: 49 of the 50 take no props at all
 * (HubCards reads the current category off the sidebar), so an import line in every file
 * would be 50 copies of pure ceremony.
 * BOTH NAMES ARE REGISTERED. `HubCards` is what the pages author — see that component for why
 * the wrapper exists — and `DocCardList` stays registered because it is the stock name, it is
 * what HubCards renders, and a page that wants the framework's exact behaviour should not have
 * to route through ours to get it. */
import DocCardList from '@theme/DocCardList';
import HubCards from '@site/src/components/HubCards';
import SchemaBadge from '@site/src/components/SchemaBadge';

/**
 * Swizzle (wrap) of the theme MDXComponents map.
 *
 * Every Markdown table is wrapped in a `.table-wrapper` element that allows
 * horizontal scrolling (`overflow-x: auto`, styled in src/css/custom.scss).
 * Most tables still fit the content column and wrap their cells (no
 * scrollbar appears); only genuinely wide tables — the 6-column error-code
 * catalogue, the 4-column interface table — scroll horizontally instead of
 * overflowing and breaking the page layout on narrow viewports.
 *
 * `SchemaBadge` is registered globally so conceptual/guide MDX can color a
 * JSON-schema type/constraint label without an import, e.g.
 * `<SchemaBadge>string</SchemaBadge>`.
 *
 * The `a` override holds this site's "external links open in a new tab" rule.
 * It delegates to `@theme/MDXComponents/A`, so baseUrl resolution and internal
 * react-router navigation are untouched; it adds `target`/`rel` and nothing
 * else, and only for an absolute http(s) href — `#hash`, root-absolute site
 * paths, `mailto:`, `tel:` and every other scheme pass straight through. The
 * `rel` is the security half of the pair, not decoration: `noopener` is what
 * stops the opened tab reaching back through `window.opener`.
 *
 * It changes no rendered output today, and that is expected rather than a
 * mistake. `A` renders `@docusaurus/Link`, and Link already adds both
 * attributes to any href carrying a protocol
 * (@docusaurus/core/lib/client/exports/Link.js). Measured on the dev server
 * 2026-09-06 with this override absent, over ten routes: 14 external prose
 * links across 9 MDX files, all 14 already carrying `target="_blank"` and both
 * `rel` tokens, 0 missing. The override is here so the rule does not rest on a
 * vendor default alone — and the two attributes sit BEFORE the `props` spread,
 * which is Link.js's own ordering, so an author writing an explicit `target`
 * or `rel` on a link still wins.
 */
export default {
  ...MDXComponents,
  SchemaBadge,
  DocCardList,
  HubCards,
  a: (props: MDXAProps): React.JSX.Element => (
    <MDXA
      {...(/^https?:\/\//i.test(props.href ?? '') && {
        target: '_blank',
        rel: 'noopener noreferrer',
      })}
      {...props}
    />
  ),
  table: (props: React.ComponentProps<'table'>): React.JSX.Element => (
    <div className="table-wrapper">
      <table {...props} />
    </div>
  ),
};

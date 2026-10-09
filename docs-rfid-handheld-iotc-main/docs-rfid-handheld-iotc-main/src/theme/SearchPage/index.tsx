/**
 * WRAPS the DocSearch adapter's search page for ONE reason: to emit a `noindex` that
 * crawlers actually obey.
 *
 * THE BUG THIS FIXES. @docsearch/docusaurus-adapter's SearchPage renders
 *     <meta property="robots" content="noindex, follow">
 * and `property` is the wrong attribute. `property` is the RDFa/Open Graph key; the robots
 * directive is only read from `name`. Google, Bing and every other crawler ignore a
 * `property="robots"` tag entirely, so /search was fully indexable — reachable from the
 * navbar on every page, and therefore discoverable.
 *
 * IT LOOKED HANDLED, WHICH IS WHY IT SURVIVED. `sitemap.ignorePatterns` in
 * docusaurus.config.ts keeps /search out of sitemap.xml, and the comment there correctly
 * records that the sitemap plugin cannot detect a `property="robots"` tag. That note stops
 * one step short: the same wrong attribute that hides the tag from the sitemap plugin also
 * hides it from crawlers. Staying out of the sitemap is not the same as being noindexed —
 * a sitemap is a hint about what to crawl, not a boundary.
 *
 * WHY A WRAPPER RATHER THAN A SWIZZLE. An eject would fork the adapter's whole search page
 * and freeze it at today's version; this adds one tag and inherits every upstream change.
 * react-helmet dedupes on the `name` key, so this does not collide with the vendored
 * `property` tag — both are emitted, and the one crawlers read now says noindex.
 *
 * `follow` is deliberate: the page should not be indexed, but the links on it are ordinary
 * internal links and there is no reason to bleed their crawl signal.
 *
 * STILL NEEDED AFTER THE v4 -> v5 ADAPTER BUMP (2026-08-29). The obvious question at a major
 * version is whether upstream fixed it; it did not. @docsearch/docusaurus-adapter 5.0.4 still
 * writes `property` — node_modules/@docsearch/docusaurus-adapter/src/theme/SearchPage/index.tsx:222,
 * compiled to lib/theme/SearchPage/index.js:197 — and the built /search page still
 * carries BOTH tags — the vendor's `property="robots"` and this file's `name="robots"` —
 * confirmed in the browser on the v5 build. Delete this wrapper only after checking that the
 * rendered page still says noindex without it.
 */
import React, { type ReactNode } from 'react';
import Head from '@docusaurus/Head';
import SearchPage from '@theme-original/SearchPage';
import type SearchPageType from '@theme/SearchPage';
import type {WrapperProps} from '@docusaurus/types';

type Props = WrapperProps<typeof SearchPageType>;

export default function SearchPageWrapper(props: Props): ReactNode {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, follow" />
      </Head>
      <SearchPage {...props} />
    </>
  );
}

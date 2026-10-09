/**
 * PER-INSTANCE BROWSER TITLE. A swizzle of theme-classic's own
 * node_modules/@docusaurus/theme-classic/lib/theme/ThemeProvider/TitleFormatter/index.js, whose
 * shipped body is a one-line delegation to `params.defaultFormatter(params)` above the comment
 * "Add your own title formatting logic here!" — so this is the surface the framework provides for
 * exactly this job, not a prised-open internal.
 *
 * THE DEFECT IT FIXES. The FXR60 / FXR90 fixed-reader REST reference is a second content-docs
 * instance on a site whose `title` is 'Zebra Handheld RFID Reader | IoT Connector'. That title is
 * TRUE and stays (owner ruling, 2026-08-13), and the default formatter appends it to every page on
 * the site, so each of the fixed-reader pages shipped a <title> reading, measured off the built
 * HTML before this file existed:
 *
 *     Retrieves reader component version information | Zebra Handheld RFID Reader | IoT Connector
 *     Logs | Zebra Handheld RFID Reader | IoT Connector
 *
 * In a search result, a shared link, a browser tab or a bookmark — the four places a <title> is the
 * ONLY thing a reader sees — that attributes a fixed-reader REST operation to the handheld product,
 * which is the precise conflation the ruling exists to prevent. The handheld exposes no REST
 * surface at all, and four pages under docs/ say so.
 *
 * WHY THIS AND NOT A PER-PAGE <Head>. There is no per-instance title suffix in the site
 * configuration, and that was read as "cannot be fixed without changing the site title". It can:
 * `useTitleFormatter()` in
 * node_modules/@docusaurus/theme-common/lib/utils/titleFormatterUtils.js:33-47 reads the formatter
 * out of React context and passes it `plugin` — the `{name, id}` of the plugin that OWNS the route,
 * taken from `useRouteContext()` — so a formatter can branch per docs INSTANCE. That reaches every
 * page the instance creates, which a component swizzle cannot: `docItemComponent` applies to doc
 * ITEM pages only, so the instance's generated-index category pages are rendered by
 * @theme/DocCategoryGeneratedIndexPage and would keep the wrong title. Measured on the built tree:
 * 15 of the reference's 90 pages are generated-index pages and carry no ApiItem markup at all.
 *
 * The site title, the tagline and `docusaurus.config.ts`'s `title` field are all untouched, and the
 * main instance's 168 routes still go through `defaultFormatter` unchanged — asserted below by
 * delegating in every branch except the one keyed on this instance id.
 */

import React, { type ReactNode } from 'react';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- '@docusaurus/theme-common/internal' ships types but is not in this project's
// declaration program; theme-classic's own TitleFormatter imports it exactly this way.
import { TitleFormatterProvider } from '@docusaurus/theme-common/internal';
import type { Props } from '@theme/ThemeProvider/TitleFormatter';

/**
 * The `id` of the fixed-reader docs instance, as declared in `docusaurus.config.ts`. If it is ever
 * renamed there this branch stops matching and every fixed-reader page silently reverts to the
 * handheld site title — so the pair is asserted by the built-HTML check in the review notes rather
 * than trusted, and the name is kept in one place here.
 */
const FXR_INSTANCE_ID = 'fxr';
const DOCS_PLUGIN_NAME = 'docusaurus-plugin-content-docs';

/**
 * What replaces the site title on that instance's pages. It names the MODEL FAMILY and the PRODUCT
 * CLASS, so neither a handheld reader nor a fixed-reader reader can mistake which line a search
 * result belongs to, and it keeps the brand, which the string it replaces also carried. It is the
 * same wording as the reference's own landing-page heading and the same string the Algolia crawler
 * request asks for as `lvl0`, so one vocabulary covers the title, the page and the search facet.
 */
const FXR_SCOPE = 'Zebra FXR60 / FXR90 fixed reader REST API';

type FormatterParams = {
  title: string;
  siteTitle: string;
  titleDelimiter: string;
  plugin: { id: string; name: string };
  defaultFormatter: (params: Omit<FormatterParams, 'defaultFormatter'>) => string;
};

/**
 * Exported for the self-test in the review notes and for any future gate: it is a pure function of
 * its parameters, so it can be checked without a browser.
 */
export function formatTitle(params: FormatterParams): string {
  const { title, titleDelimiter, plugin, defaultFormatter } = params;
  const isFxr = plugin?.name === DOCS_PLUGIN_NAME && plugin?.id === FXR_INSTANCE_ID;
  if (!isFxr) return defaultFormatter(params);
  const trimmed = title?.trim();
  // Both guards mirror the default formatter's own shape (titleFormatterUtils.js:11-17): an empty
  // title yields the scope string alone, and a page whose title IS the scope — the reference's
  // landing page, headed 'FXR60 / FXR90 fixed reader REST API' — must not read
  // '… | Zebra FXR60 / FXR90 fixed reader REST API'.
  if (!trimmed) return FXR_SCOPE;
  if (trimmed === FXR_SCOPE || FXR_SCOPE.endsWith(trimmed)) return FXR_SCOPE;
  return `${trimmed} ${titleDelimiter} ${FXR_SCOPE}`;
}

export default function ThemeProviderTitleFormatter({ children }: Props): ReactNode {
  return (
    <TitleFormatterProvider formatter={formatTitle}>
      {children}
    </TitleFormatterProvider>
  );
}

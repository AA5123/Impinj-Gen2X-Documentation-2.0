import {
  useActiveDocContext,
  useActivePlugin,
} from '@docusaurus/plugin-content-docs/client';

/**
 * What kind of route the reader is currently on. Three kinds, exhaustive:
 *
 *   • 'generated-index' — a category landing page Docusaurus BUILT from the
 *     sidebar (`link: {type: 'generated-index'}`). It has no authored prose and
 *     no source file: its body is an auto-generated grid of DocCards.
 *   • 'doc' — an authored document from the docs plugin (a `.md`/`.mdx` file).
 *   • 'page' — anything else the theme renders: the standalone React/MDX routes
 *     under `src/pages` (home, report-broken-link), the 404, tag pages.
 *
 * WHY THIS EXISTS. Several page-level affordances — the "Copy page for LLM"
 * dropdown, the PDF download links — are meaningful only where there is
 * authored content to copy or print. They were each gated by their own URL
 * regex, and a URL regex cannot answer this question: a generated index's route
 * is indistinguishable, by shape, from the authored doc sitting next to it.
 * Asking the framework instead makes the answer exact and gives the three cases
 * names, so a call site reads as a route classification rather than as string
 * surgery on a pathname.
 *
 * THE INVARIANT, and it is the framework's own, not an inference of ours.
 * `GlobalDoc.id` in `@docusaurus/plugin-content-docs/client` is documented as:
 *
 *     "For generated index pages, this is the `slug`, **not** `permalink`
 *      (without base URL). Because slugs have leading slashes but IDs don't,
 *      there won't be clashes."
 *
 * So a leading `/` on `activeDoc.id` IS the generated-index marker — Docusaurus
 * relies on that same disjointness to keep the two id namespaces from colliding.
 * Re-derived at the time of writing against the docs plugin's own generated
 * global data (the `versions[].docs` array this hook reads through
 * `useActiveDocContext`): 35 of 35 generated-index entries carry a leading `/`,
 * and 0 of 133 authored docs do — no false positive and no false negative. The
 * test is asserted once, here, and consumed by name everywhere else.
 *
 * FOLLOW-ON, recorded rather than done: suppression-by-predicate is itself the
 * architecture that produced the leak this hook closes — every page-level
 * affordance is rendered on every route and then argued out of the ones that
 * should not have it. The target is a composed page-actions slot that page
 * templates opt into, at which point the 'generated-index' branch stops being a
 * thing anyone has to remember. Until then, this hook is the one place the
 * question is answered.
 */
export type RouteKind = 'generated-index' | 'doc' | 'page';

export default function useRouteKind(): RouteKind {
  // Resolve the docs plugin instance from the route first, so this stays correct
  // if a second docs plugin instance is ever added. Off every docs route
  // `useActivePlugin()` is undefined and `useActiveDocContext` falls back to the
  // default instance, whose docs cannot match the pathname — which is exactly
  // the 'page' answer.
  const activePlugin = useActivePlugin();
  const {activeDoc} = useActiveDocContext(activePlugin?.pluginId);

  if (!activeDoc) {
    return 'page';
  }
  return activeDoc.id.startsWith('/') ? 'generated-index' : 'doc';
}

/**
 * IS THIS PAGE A HUB — i.e. does it have child items?
 *
 * ONE PREDICATE, TWO CONSUMERS, ONE SOURCE OF TRUTH. The owner's rule is a clean split: a page
 * WITH child items carries the <HubCards /> grid; a page WITHOUT carries the page-meta line. Two
 * more things hang off the same split — a hub takes no "Copy page" control, because there is no
 * prose on it to copy — so the test is written once here rather than three times in three
 * components that could drift apart.
 *
 * THE TEST IS THE FRONT MATTER, NOT THE SIDEBAR, and that is deliberate. A runtime check ("is
 * this page the link of a sidebar category?") sounds more authoritative and is worse in two
 * ways: it is false for /guides/ and /resources/, which are reached through `displayed_sidebar`
 * and belong to no category while plainly having children; and it would let the rendered page
 * disagree with its own data, so a hub could show a meta line the front matter says it has none
 * of. The migration stripped `doc_type` from all 50 hubs and gave it to every other page, so the
 * absence of that key IS the property — and `npm run build` fails loudly if a page is neither.
 *
 * Callers must already be inside a docs route: useDoc() throws outside one. Heading gates on
 * `routeKind === 'doc'` before reading this.
 */
import { useDoc } from '@docusaurus/plugin-content-docs/client';

export default function useIsHubPage(): boolean {
  const { frontMatter } = useDoc();
  const fm = frontMatter as Record<string, unknown>;
  return typeof fm.doc_type !== 'string' && !Array.isArray(fm.page_meta);
}

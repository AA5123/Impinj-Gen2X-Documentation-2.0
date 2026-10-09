/**
 * Override @theme/NotFound/Content — the inner content imported DIRECTLY
 * by @theme/DocRoot when the current doc route's metadata is missing.
 *
 * Why this exists: @theme/DocRoot has this code path —
 *
 *     if (!currentDocRouteMetadata) {
 *       return <NotFoundContent />;  // imports @theme/NotFound/Content
 *     }
 *
 * — which bypasses @theme/NotFound (the page wrapper) entirely. Without
 * this override, any URL under the docs section (which for this site is
 * the base URL `/zebra-handheld-rfid-iotc/`, so effectively EVERY url)
 * shows the default Docusaurus 'Page Not Found / We could not find what
 * you were looking for' content — bypassing our custom 404.
 *
 * DocRoot renders this inside its own Layout, so this component must
 * NOT wrap itself in <Layout> (the comment in DocRoot explicitly notes
 * this: "We only render the not found content to avoid a double layout").
 *
 * See /_meta/governance/site-rulebooks/404-PAGE.md and the comment header in NotFoundBody.tsx for
 * the three-surfaces architecture.
 */

import React from 'react';
import NotFoundBody from '@site/src/components/NotFoundBody';

export default function NotFoundContent(): React.JSX.Element {
  return <NotFoundBody />;
}

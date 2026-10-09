/**
 * THE SCOPE BAND for the FXR60 / FXR90 fixed-reader REST reference.
 *
 * WHY A COMPONENT OF THIS NAME REACHES ONLY THAT REFERENCE. `docItemComponent` is a per-docs-
 * instance option, and only the fixed-reader instance sets it — to '@theme/RestDocItem', which
 * this file provides. The main instance and the MQTT instance keep the default '@theme/DocItem'.
 * So this file is rendered by the fixed-reader instance's pages and by nothing else on the site:
 * containment is by instance, not by a route test in here.
 *
 * IT WAS src/theme/ApiItem UNTIL 2026-08-18, and the rename records a real change rather than a
 * tidy-up. That file was a WRAPPER: '@theme/ApiItem' resolved to docusaurus-theme-openapi-docs'
 * own doc-item shell, and this component delegated to it through '@theme-original/ApiItem' after
 * prepending the band. That theme is gone — the operation reference is now one Scalar route,
 * registered by plugins/scalar-api-reference — so there is no original to delegate to, and a
 * component still called ApiItem would name a vendor component that no longer exists.
 *
 * WHAT THE SWAP GAINED FOR THESE PAGES, and it is not a compromise. They now render through
 * '@theme/DocItem', which on this site is src/theme/DocItem — so the fifteen hand-written REST
 * pages compose the same swizzles every other page does, including the per-page feedback widget in
 * src/theme/DocItem/Footer and the Heading treatment ratified §12.19(9). Under the OpenAPI theme's
 * shell they composed NONE of them; that asymmetry was the price of the old renderer and it is
 * paid back here.
 *
 * WHAT IT COVERS NOW. The instance is down to FOURTEEN pages from ninety, because the 73 operations
 * and the 15 tag-index pages left with the generator (`find api/rest -name '*.mdx' | wc -l` = 14).
 * Thirteen of the fourteen get the band; the fourteenth is the instance's own landing page, which
 * states its scope at greater length in its own body — see the guard below.
 *
 * TREATMENT. @theme/Admonition, type 'note' — the design system's own callout taxonomy (owner
 * ruling 45: note, caution, warning, important), so this inherits every token, the icon, the
 * spacing and both colour schemes instead of inventing a band. 'note' and not 'important': the
 * landing page's fuller note is the emphatic statement of scope, and repeating that weight on every
 * page would train readers to skip it. One sentence, one link, no new CSS.
 *
 * THE ONE PAGE THAT MUST NOT GET THE BAND, AND WHY THE TEST IS THE ID. `docItemComponent` applies
 * to EVERY doc of the instance, and the instance's own landing page is one of those docs — and it
 * already carries a fuller statement of the same scope in its front-matter body
 * (`:::important[Scope: fixed readers only]`, at api/rest/index.mdx:12). Without the guard a reader
 * meets the same statement twice inside one screen of scrolling.
 *
 * The test is `props.content.metadata.id`, and it is READ FROM PROPS ON PURPOSE. `useDoc()` cannot
 * be used here: the doc context is created by the DocItem BELOW this wrapper, and useDoc() throws
 * ReactContextError when that context is null, at
 * node_modules/@docusaurus/plugin-content-docs/lib/client/doc.js:41-47. Calling it from here would
 * therefore throw at render on every page of the instance and take the build with it. Props are
 * exactly where DocItem itself reads the same value. Optional chaining because the prop is typed
 * `unknown` here and a wrapper must not be the thing that crashes a page.
 *
 * `'index'` is the id of one file and only one: `grep -rn '^id: index$' api/rest/` returns
 * api/rest/index.mdx and nothing else. The above-the-h1 placement of the band is deliberate and is
 * recorded here so it is not "tidied" later: the scope has to be read before the material it
 * qualifies.
 */

import React, { type ReactNode } from 'react';
import Link from '@docusaurus/Link';
import Admonition from '@theme/Admonition';
import DocItem from '@theme/DocItem';

/** The shape this wrapper reads off the doc props. Everything else passes through untouched. */
type RestDocItemProps = React.ComponentProps<typeof DocItem> & {
  content?: { metadata?: { id?: string } };
};

export default function RestDocItem(props: RestDocItemProps): ReactNode {
  // The instance's own landing page states its scope in its body; the band would be the second
  // copy on that one page. See the header note.
  const isInstanceIndex = props.content?.metadata?.id === 'index';

  return (
    <>
      {!isInstanceIndex && (
        <Admonition type="note" title="Fixed readers only">
          <p>
            This page documents the <strong>Zebra FXR60 / FXR90 fixed RFID readers</strong>. The
            RFD40 / RFD90 handheld reader sleds are a different product line, use MQTT rather than
            REST, and are documented in the{' '}
            <Link to="/api-reference/mqtt">handheld MQTT API reference</Link>.
          </p>
        </Admonition>
      )}
      <DocItem {...props} />
    </>
  );
}

/**
 * Override @theme/NotFound — the React component the client-side router
 * uses for the wildcard `*` catch-all route.
 *
 * CURRENTLY UNREACHABLE, and kept deliberately. Because the docs plugin runs at
 * routeBasePath: '/', it owns a non-exact route at the base URL that precedes
 * the `*` wildcard in the router's switch, so every in-app 404 lands in
 * DocsRoot -> DocVersionRoot -> DocRoot, which renders @theme/NotFound/Content
 * directly. Do not conclude from this file that the client router sets the title
 * or the robots meta — the body does (src/components/NotFoundBody.tsx). This
 * file becomes live again the moment routeBasePath stops being '/', which is
 * why it stays rather than being deleted; deleting it would silently hand the
 * wildcard route back to upstream's own head, which hardcodes the title in
 * upstream capitalisation rather than the house sentence case.
 *
 * This is one of three surfaces that render the same content; see the
 * comment header in src/components/NotFoundBody.tsx for the architecture.
 */

import React from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import NotFoundBody from '@site/src/components/NotFoundBody';

export default function NotFound(): React.JSX.Element {
  return (
    <Layout
      title="Page Not Found"
      description="The URL you requested isn't part of this documentation."
    >
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <NotFoundBody />
    </Layout>
  );
}

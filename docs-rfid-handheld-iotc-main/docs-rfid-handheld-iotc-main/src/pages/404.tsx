/**
 * Static-host 404 page.
 *
 * Docusaurus builds this into build/404.html, which GitHub Pages serves
 * for any URL that doesn't match a real route. The visible content is
 * shared with the client-side router fallbacks via NotFoundBody — see
 * /_meta/governance/site-rulebooks/404-PAGE.md and the comment header in src/components/NotFoundBody.tsx
 * for the three-surfaces architecture.
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

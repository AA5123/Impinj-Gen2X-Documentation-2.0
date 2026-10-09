/**
 * Swizzled @theme/DocRoot/Layout (full eject of
 * `@docusaurus/theme-classic/src/theme/DocRoot/Layout/index.tsx`, v3.10.2).
 *
 * ONE change from upstream: `hiddenSidebarContainer` is `useSidebarCollapse()`'s `collapsed`
 * rather than a `useState` declared directly in this file, and the tree is wrapped in
 * `<SidebarCollapseProvider>` to supply it. Both dual-trigger buttons that read/write this state
 * live inside `<DocSidebar>`, several layers below `DocRootLayoutSidebar` — the context is what
 * gets the flag there without threading it through every intermediate component's own props.
 *
 * SPLIT INTO TWO COMPONENTS FOR ONE MECHANICAL REASON: a component cannot consume a context it
 * provides at the same level — the Provider has to be a PARENT of anything that calls
 * `useSidebarCollapse()`, including this component's own body. `DocRootLayout` (below) owns
 * nothing but the provider and `useDocsSidebar()`; `DocRootLayoutInner` is upstream's actual
 * body, now reading `hiddenSidebarContainer`/`setHiddenSidebarContainer` from context instead of
 * from a local hook call.
 *
 * `hasSidebar` is passed to the provider as `Boolean(docsSidebar)` — computed once, synchronously,
 * by the one component that already calls `useDocsSidebar()`. See
 * src/components/SidebarCollapse/index.tsx for why this used to be a much larger piece of
 * machinery (a `@theme/Root` swizzle, a bottom-up effect, a shared ref) and no longer needs to
 * be: that was all for a persistent trigger that lived in the Navbar, a sibling of this whole
 * subtree. Both triggers now live inside the sidebar itself.
 *
 * Markup, class list, hook order and export shape are otherwise byte-identical to upstream,
 * including upstream's Prettier settings (`bracketSpacing: false`, `bracketSameLine: true`),
 * which differ from this repo's `.prettierrc.json` — kept so the file diffs cleanly against
 * node_modules on upgrade.
 *
 * Re-diff against node_modules on each Docusaurus minor.
 */
import React, {type ReactNode} from 'react';
import {useDocsSidebar} from '@docusaurus/plugin-content-docs/client';
import BackToTopButton from '@theme/BackToTopButton';
import DocRootLayoutSidebar from '@theme/DocRoot/Layout/Sidebar';
import DocRootLayoutMain from '@theme/DocRoot/Layout/Main';
import type {Props} from '@theme/DocRoot/Layout';
import {
  SidebarCollapseProvider,
  useSidebarCollapse,
} from '@site/src/components/SidebarCollapse';

import styles from '@docusaurus/theme-classic/lib/theme/DocRoot/Layout/styles.module.css';

function DocRootLayoutInner({children}: Props): ReactNode {
  const docsSidebar = useDocsSidebar();
  /* Non-null: the provider one component up always wraps this. */
  const {collapsed: hiddenSidebarContainer, setCollapsed: setHiddenSidebarContainer} =
    useSidebarCollapse()!;

  return (
    <div className={styles.docsWrapper}>
      <BackToTopButton />
      <div className={styles.docRoot}>
        {docsSidebar && (
          <DocRootLayoutSidebar
            sidebar={docsSidebar.items}
            hiddenSidebarContainer={hiddenSidebarContainer}
            setHiddenSidebarContainer={setHiddenSidebarContainer}
          />
        )}
        <DocRootLayoutMain hiddenSidebarContainer={hiddenSidebarContainer}>
          {children}
        </DocRootLayoutMain>
      </div>
    </div>
  );
}

export default function DocRootLayout(props: Props): ReactNode {
  const docsSidebar = useDocsSidebar();
  return (
    <SidebarCollapseProvider hasSidebar={Boolean(docsSidebar)}>
      <DocRootLayoutInner {...props} />
    </SidebarCollapseProvider>
  );
}

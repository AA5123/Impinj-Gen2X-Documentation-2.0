/** Swizzled @theme/Admonition/Icon/Warning — stroked Lucide outline. See AdmonitionGlyph.tsx for why. */
import React, { type ReactNode } from 'react';
import AdmonitionGlyph from './AdmonitionGlyph';

export default function AdmonitionIconWarning(props: React.ComponentProps<'svg'>): ReactNode {
  return (
    <AdmonitionGlyph {...props}>
      <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
    </AdmonitionGlyph>
  );
}

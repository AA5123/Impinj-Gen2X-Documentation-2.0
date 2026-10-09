/**
 * THE CALLOUT GLYPHS — stroked outlines, not filled shapes.
 *
 * L1 (design-system-options.html §4) deleted the callout's 6px leading accent bar and moved its
 * job to the icon: with no bar, the glyph is the primary type signal, which is what lets type
 * identity survive greyscale (the shapes differ, not only the hue) and 320px (a 6px bar is 2% of
 * the width; the icon is still ~19px).
 *
 * THE FIRST IMPLEMENTATION KEPT THE STOCK ICONS AND THAT WAS WRONG. theme-classic ships five
 * FILLED glyphs on a 16x16 viewBox (`<path fillRule="evenodd" …>`). A filled mark at 1.35em is a
 * solid lozenge of colour — it reads as a second, smaller accent bar, which is the exact thing
 * L1 removed. Every other icon on this site is a stroked 24x24 Lucide glyph at 2px with round
 * caps: the sidebar rows, the hub cards, the schema toolbar, the navbar menu. The callouts were
 * the only place still painting solid.
 *
 * These five are drawn to that same spec so the callout stops being the odd one out. `viewBox`
 * is 24x24 (not stock's 16) because the Lucide grid is 24 and the paths are Lucide's own; the
 * consuming CSS sizes by `em`, so the change of viewBox costs nothing at the call site.
 *
 * WHY EACH SHAPE. Note and Info would both be an info circle if mapped naively, and two families
 * sharing a glyph defeats the point. So Note takes the editorial mark it actually is (a pencil),
 * Info keeps the circle, and the three severity levels escalate in shape: lightbulb (tip),
 * triangle (warning/caution), octagon (danger) — the road-sign convention, which is legible
 * before the colour is.
 */
import React, { type ReactNode } from 'react';

export default function AdmonitionGlyph({
  children,
  ...props
}: React.ComponentProps<'svg'> & { children: ReactNode }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}>
      {children}
    </svg>
  );
}

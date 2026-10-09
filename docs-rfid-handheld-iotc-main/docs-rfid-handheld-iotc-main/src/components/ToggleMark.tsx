import React from 'react';

/**
 * ToggleMark — the +/- disclosure mark shared by the schema table and the JSON viewer
 * (469 of them across 26 reference pages). Styled by `.api-toggle-mark` in api.scss.
 *
 * `open` means the disclosure is EXPANDED, i.e. the mark reads '−'.
 *
 * Three things here are load-bearing, and each one exists because the obvious alternative was
 * measured and found wanting. Do not "simplify" any of them back.
 *
 * 1. ONE <svg> HOLDING BOTH BARS, not two CSS boxes.
 *    A CSS box paints on Blink's SNAPPED path: a 2px bar covers round((y+2)*dpr) - round(y*dpr)
 *    = 2 OR 3 whole opaque device rows depending on its sub-pixel y. Page rows do not share a
 *    phase (the JSON viewer's line pitch is 21.075px), so neighbouring toggles drew bars of
 *    different weight — a 50% jump. The same split made the '+' lean: the un-rotated arm was
 *    snapped while the rotated stem was antialiased, so their painted centres disagreed by half
 *    a device pixel. One shape cannot be snapped and antialiased at once; one SVG rasterises
 *    both in a single coverage-based pass, so weight is exactly 2*dpr with zero spread.
 *
 * 2. FILLED <rect>s, NOT stroked <line>s with vector-effect="non-scaling-stroke".
 *    The stroked version is tempting: because of (3) the svg is sized by `inset: 0`, so its
 *    user-space scale follows the padding box (18.000 CSS px at display scale 1, 18.4 at 1.25),
 *    and filled rects scale with it — the bar reads 2.56 device px against a 2.50 "ideal" at
 *    1.25. A non-scaling stroke is resolved in screen space and hits the nominal figure exactly.
 *    It was measured and REJECTED, because the figure it hits is the wrong target. Skia snaps a
 *    non-scaling stroke at some sub-pixel phases and antialiases it at others, so the painted
 *    weight varies BETWEEN NEIGHBOURING MARKS: measured 2.00..2.20 at display scale 1.1 (a 9%
 *    spread) and 2.79..3.01 at 1.4. Filled rects measure a spread of 0.000 at every scale.
 *    Nobody compares a mark against a nominal ideal; they compare it against the mark on the
 *    next row. A uniform 2% deviation is invisible, an 8% difference between adjacent controls
 *    is precisely the "some are thicker than others" defect this component exists to prevent.
 *
 * 3. THE VIEWBOX IS 18 UNITS AND THE BOX IS SIZED BY `inset: 0` (see api.scss).
 *    Sizing it 16x16 and centring it with calc(50% - 8px) places the mark on the button's
 *    GEOMETRIC centre — but the button's border box is snapped when painted, which translates
 *    the rectangle the user actually sees by up to half a device pixel. The mark then sits off
 *    the visible centre, differently per row. `inset: 0` makes the mark's edges the padding-box
 *    edges, so it snaps WITH the button instead of against it.
 *
 * Measured offset of the mark's ink from the centre of the border's painted inner edges, in
 * device px — the quantity a reader actually perceives, cross-checked by hand against a pixel
 * dump (the old build shows 11 blank rows above the bar and 10 below at scale 1.5, i.e. 0.5 low):
 *
 *     display scale   before (18px, calc)   after (20px, inset)   arm weight, after
 *       1.00              0.000                  0.000            2.00  spread 0.000
 *       1.10              0.800                  0.000            2.22  spread 0.000
 *       1.25              0.500                  0.000            2.56  spread 0.000  <- Win default
 *       1.40              0.692                  0.000            2.90  spread 0.000
 *       1.50              0.500                  0.000            3.12  spread 0.000
 *       1.75              0.500                  0.000            3.67  spread 0.000
 *       2.00              0.000                  0.000            4.00  spread 0.000
 *       2.50              0.500                  0.000            5.12  spread 0.000
 *       3.00              0.000                  0.000            6.00  spread 0.000
 *   (93 marks per scale, two routes x three sub-pixel page offsets x three scroll anchors,
 *    both states, dx and dy both 0.000 at every one of the nine.)
 *
 * The box had to grow 18px -> 20px for this: the offset can only vanish when the border box
 * lands on whole device pixels, and 18 x 1.25 = 22.5 never does, while 20 x dpr is an integer at
 * every scale above (22, 25, 28, 30, 35, 40, 50, 60). The earlier note that "20px newly
 * overflows set-wifi @900" was measured against the old glyph construction and does not
 * reproduce: page overflow is 0 at 360/390/768/900/1280/1440 for 16, 18 and 20px alike, and the
 * worst inner scroll is identical to the 18px build at every one of those widths.
 *
 * KNOWN AND ACCEPTED: the weight column above is 0.9-4.9% above a nominal 2*dpr, because with
 * `inset: 0` the 18-unit viewBox maps onto the padding box, which is 18.000 CSS px at scale 1 but
 * 18.4 at 1.25, so the bar is 2.0-2.1 CSS px rather than exactly 2.0. It is UNIFORM — spread is
 * 0.000 at every scale, so no two marks on a page differ — and that is the property that matters
 * here: the reported defect was marks differing from EACH OTHER, never from an ideal. Buying the
 * nominal figure back with a non-scaling stroke costs an 8-9% spread between neighbours, which is
 * strictly worse. Do not "fix" this number without re-measuring the spread.
 */
export default function ToggleMark({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      className={`api-toggle-mark${open ? ' api-toggle-mark--open' : ''}`}
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      {/* No rx on either rect — the caps stay SQUARE. Carried over from the CSS bars: the
          concentric-radius rule one level in gives 4 (the button's radius) - 1 (its border)
          - 3 (the gap to the bar) = 0. Both rects are centred on (9,9) of the 18-unit viewBox,
          which is what lets one transform-origin serve the whole mark. */}
      {/* the arm: always drawn, in both states */}
      <rect x="4" y="8" width="10" height="2" />
      {/* the stem: rotated onto the arm when expanded, so a state change cannot move the ink */}
      <rect className="api-toggle-mark__stem" x="8" y="4" width="2" height="10" />
    </svg>
  );
}

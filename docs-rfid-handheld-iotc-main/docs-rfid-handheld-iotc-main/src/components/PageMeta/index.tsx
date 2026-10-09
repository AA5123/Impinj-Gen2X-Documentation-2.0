/**
 * PAGE META — the Diátaxis type chip and the quiet metadata line under an H1.
 *
 * REPLACES A MARKDOWN BLOCKQUOTE ON 186 PAGES. The line used to be authored by hand:
 *
 *     > 📘 **EXPLANATION** · **Audience:** All personas · **Read time:** ~2 min
 *
 * Three things were wrong with that, and only the third is cosmetic.
 *
 *   1. THE SEMANTIC WAS BORROWED. A blockquote means "this is quoted from elsewhere". This is
 *      metadata about the page you are on. Because it borrowed the element it also borrowed the
 *      styling: a grey slab at 16px — the same size as the prose beneath it — so it read as the
 *      first paragraph rather than as a label.
 *   2. IT WAS 186 HAND-MAINTAINED COPIES. The read times were counted by hand, the type was an
 *      emoji whose colour is decided by the reader's operating system, and nothing could query
 *      any of it. Front matter makes the type filterable, the times computable, and the next
 *      redesign of this element ONE component instead of 186 edits.
 *   3. THE FOUR TYPES WERE INVISIBLE. A clean Diátaxis split that tells a reader what kind of
 *      help a page offers before they read a word — all rendered in identical grey.
 *
 * PAIRS ARE PRESERVED IN ORDER, VERBATIM, and that is deliberate. A survey of every line found
 * nine distinct labels, not the three a rigid schema would have assumed: Audience, Read time,
 * Time, Use, Ties to, Phase, Prerequisite, Goal. `Read time` and `Time` are not synonyms in the
 * authors' usage — a tutorial's "Time: 15 min" is hands-on time, an explanation's "Read time:
 * 2 min" is reading time — so collapsing them would have destroyed a distinction the writers
 * were making. `page_meta` is therefore an ordered list of label/value pairs.
 *
 * EVERY GLYPH IS AN <Icon>, NOT AN INLINE PATH — changed 2026-09-10. This file used to carry
 * thirteen hand-copied <path> strings. They were byte-identical to the vendored Lucide SVGs,
 * but a reader of this file could not verify that and nothing checked it, so the owner's
 * report ("use Lucide's clock icon from our pre-installed library") was right about the
 * ARCHITECTURE even where it was wrong about the pixels. The names live in
 * src/components/icons; changing a glyph is now a one-line edit there and it moves every
 * surface at once.
 */
import React, { type ReactNode } from 'react';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import Link from '@docusaurus/Link';
import Icon, { type IconName } from '@site/src/components/icons';
import styles from './styles.module.css';

/** The four Diátaxis kinds, and the only values `doc_type` may take. */
const TYPES = {
  explanation: { label: 'Explanation', className: 'expl', icon: 'DocExplanation' },
  'how-to': { label: 'How-to', className: 'howto', icon: 'DocHowTo' },
  reference: { label: 'Reference', className: 'ref', icon: 'DocReference' },
  tutorial: { label: 'Tutorial', className: 'tut', icon: 'DocTutorial' },
} as const satisfies Record<string, { label: string; className: string; icon: IconName }>;

type DocType = keyof typeof TYPES;

/* ── ONE MARK PER LABEL, AND THE MARK REPLACES THE LABEL ────────────────────────────────────
 * The presented M1 reads `[users] All personas · [clock] 2 min read` — no word "Audience", no
 * word "Read time". That is the point of the line: at 11.5px, half of every pair was spent
 * naming a field whose answer is self-evident once you can see it, and the eye landed on
 * "Read time" instead of on "2 min".
 *
 * THE LABEL IS NOT DELETED, IT IS MOVED TO THE ACCESSIBILITY TREE. A glyph cannot say "Ties to"
 * and no icon in any library can; dropping the word outright would make the line ambiguous to a
 * screen reader for the sake of a visual it cannot see anyway. So every pair renders its label
 * in a visually-hidden span and the icon stands in its place on screen.
 *
 * `suffix` IS THE UNBOLDED WORD AFTER THE VALUE, and only `Read time` takes one. "2 min" alone
 * under a clock could be a duration of anything; "read" says which kind, and it is deliberately
 * NOT bold — the value is what a scan should land on.
 *   `Time` TAKES NO SUFFIX, and that is a decision rather than an omission. Its values are
 * hands-on durations — "~2 hours planning", "days to weeks for a full fleet", "10 min per
 * playbook" — and appending "read" to any of them would state something false. The stopwatch
 * glyph and the page's own Tutorial or How-to chip already say what kind of time it is. */
type PairMark = { icon: IconName; suffix?: string };

const MARKS: Record<string, PairMark> = {
  audience: { icon: 'MetaAudience' },
  'read time': { icon: 'MetaReadTime', suffix: 'read' },
  time: { icon: 'MetaTime' },
  use: { icon: 'MetaUse' },
  'ties to': { icon: 'MetaTiesTo' },
  phase: { icon: 'MetaPhase' },
  prerequisite: { icon: 'MetaPrerequisite' },
  goal: { icon: 'MetaGoal' },
};

const FALLBACK: PairMark = { icon: 'MetaOther' };

/** A `"Label: value"` entry from front matter, split once on the first colon. */
function splitPair(entry: string): { label: string; value: string } | null {
  const i = entry.indexOf(':');
  if (i < 1) return null;
  return { label: entry.slice(0, i).trim(), value: entry.slice(i + 1).trim() };
}

/**
 * A value may carry Markdown links — `[MQTT API](/api-reference/mqtt/)`. The line is rendered
 * from front matter, which never passes through MDX, so nothing else would turn them into
 * anchors; without this a link in a value renders as its own square brackets.
 *
 * A DELIBERATELY SMALL GRAMMAR: inline links only, no other Markdown. Front matter is metadata,
 * not prose, and the moment this accepts emphasis and code spans it becomes a second, worse
 * Markdown renderer that has to keep step with the real one. `@docusaurus/Link` is what carries
 * baseUrl resolution and client-side routing, so a link here behaves like every other internal
 * link on the site rather than like a full page load.
 */
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

function renderValue(value: string): ReactNode {
  if (!value.includes('[')) return value;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of value.matchAll(LINK_RE)) {
    if (m.index! > last) out.push(value.slice(last, m.index));
    out.push(
      // `doc-control` IS THE CODEBASE'S OWN OPT-OUT, not a class invented here. custom.scss
      // underlines every prose link at rest with `.markdown a[href]:not(.doc-control)` — a
      // (0,3,1) selector the meta line sits inside — and that opt-out is the one stable name
      // this site gives to "an anchor rendered into the content column that is chrome rather
      // than prose". That is exactly what this is. The alternative was stacking four class
      // repetitions to out-specify a rule that was never meant to reach here.
      <Link key={m.index} to={m[2]} className={`doc-control ${styles.link}`}>
        {m[1]}
      </Link>,
    );
    last = m.index! + m[0].length;
  }
  if (last < value.length) out.push(value.slice(last));
  return out;
}

export default function PageMeta(): ReactNode {
  const { frontMatter } = useDoc();
  const raw = (frontMatter as Record<string, unknown>).doc_type;
  const docType = typeof raw === 'string' ? (raw as DocType) : undefined;
  const meta = (frontMatter as Record<string, unknown>).page_meta;
  const pairs = Array.isArray(meta)
    ? meta.filter((e): e is string => typeof e === 'string').map(splitPair).filter(Boolean)
    : [];

  // A page with neither is a page that never had the blockquote — render nothing rather than an
  // empty rule. That set is exactly the 50 pages WITH CHILD ITEMS: they carry <HubCards /> and
  // no meta line, which is the owner's rule and is enforced in the front matter rather than at
  // runtime, so the two halves cannot disagree.
  if (!docType || !TYPES[docType]) {
    if (pairs.length === 0) return null;
  }

  const type = docType ? TYPES[docType] : undefined;

  return (
    <p className={styles.pageMeta}>
      {type && (
        <span className={`${styles.chip} ${styles[type.className]}`}>
          <Icon name={type.icon} size={12} strokeWidth={2} className={styles.chipIcon} />
          {/* The label is its own span so it can be MEASURED — see the note in the stylesheet
              for what that measurement found. An anonymous flex item cannot be targeted by a
              rule or read back by a probe, and this chip has now been measured three times. */}
          <span className={styles.chipLabel}>{type.label}</span>
        </span>
      )}
      {pairs.map((p, i) => {
        const mark = MARKS[p!.label.toLowerCase()] ?? FALLBACK;
        return (
          <React.Fragment key={i}>
            {/* The separator is a CHARACTER, as presented, not a pseudo-element dot — a middot
                sits on the line's optical centre and scales with the type, which a fixed-size
                circle does not. `user-select: none` in the stylesheet keeps it out of a copied
                selection and `aria-hidden` out of the announcement, which were the two things
                the pseudo-element bought. */}
            {(i > 0 || type) && (
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
            )}
            <span className={styles.pair}>
              <Icon name={mark.icon} size={13} strokeWidth={2} className={styles.pairIcon} />
              {/* THE TEXT IS ONE INLINE RUN, wrapped so the pair's flex `gap` separates the GLYPH
                  from the words and nothing else. Without this wrapper the value and its suffix
                  were both flex items, so "3 min" and "read" were parted by the 6px gap AND by
                  the literal space in the markup — the owner's report that there looked to be
                  more than one space between them. There is one now, and it is an ordinary word
                  space in an ordinary line of text. */}
              <span className={styles.pairText}>
                <span className={styles.srOnly}>{p!.label}: </span>
                <span className={styles.value}>{renderValue(p!.value)}</span>
                {mark.suffix ? <span className={styles.suffix}> {mark.suffix}</span> : null}
              </span>
            </span>
          </React.Fragment>
        );
      })}
    </p>
  );
}

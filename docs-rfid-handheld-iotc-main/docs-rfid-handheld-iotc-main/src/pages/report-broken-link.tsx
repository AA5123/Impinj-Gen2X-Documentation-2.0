/**
 * Report-broken-link page.
 *
 * Reached from the 404 page's "Report broken link" affordance. Reads
 * the attempted URL and referrer from query-string parameters (?url=
 * &referrer=) so the report is pre-populated; the visitor can refine
 * the URL, add a description, then pick a submission channel.
 *
 * Two submission channels:
 *   1. Copy to clipboard       — works for everyone, no login
 *   2. Compose email (mailto:) — works in any email client, no login
 *
 * The page is intentionally not in the sidebar — it's an action page
 * reached from the 404, not browsable content. Indexing is disabled.
 */

import React, { useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Head from '@docusaurus/Head';
import { PageMetadata } from '@docusaurus/theme-common';
import { track } from '@site/src/analytics/track';
import Icon from '@site/src/components/icons';
import styles from './report-broken-link.module.css';

function buildReportText(
  url: string,
  referrer: string,
  description: string,
): string {
  return [
    'Broken link report',
    '',
    `Attempted URL: ${url || '(not provided)'}`,
    `Referrer: ${referrer || '(none)'}`,
    '',
    'Description:',
    description || '(none provided)',
    '',
    '---',
    'Reported via the Zebra IOTC docs broken-link form.',
  ].join('\n');
}

function buildMailtoUrl(
  url: string,
  referrer: string,
  description: string,
): string {
  const subject = `Broken link on docs: ${url || 'unknown URL'}`;
  const body = buildReportText(url, referrer, description);
  // Note: no recipient is specified. Most email clients will open the
  // compose window with the user's default account; they can address
  // it to their docs maintainer / team contact.
  return `mailto:?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export default function ReportBrokenLink(): React.JSX.Element {
  const [url, setUrl] = useState('');
  const [referrer, setReferrer] = useState('');
  const [description, setDescription] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );

  // Read query parameters on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qUrl = params.get('url');
    const qReferrer = params.get('referrer');
    if (qUrl) setUrl(qUrl);
    if (qReferrer) setReferrer(qReferrer);
  }, []);

  async function handleCopy(): Promise<void> {
    const text = buildReportText(url, referrer, description);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers / non-secure contexts.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyState('copied');
      track('report_broken_link_submit', { channel: 'copy', has_description: !!description });
    } catch {
      setCopyState('error');
    }
    window.setTimeout(() => setCopyState('idle'), 2500);
  }

  return (
    <Layout
      title="Report a Broken Link"
      description="Tell us about a broken or stale URL in the Zebra Handheld RFID Reader IoT Connector documentation."
    >
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      {/* This page's own card from social-cards-manifest.json, written out in full because
          lint-static-orphans.mjs finds an asset only by its file name. */}
      <PageMetadata image="/img/social/report-broken-link.png" />

      <main className={styles.main}>
        <div className={styles.container}>
          {/* Intro */}
          <header className={styles.intro}>
            <h1 className={styles.title}>Report a Broken Link</h1>
            <p className={styles.subtitle}>
              Tell us about a URL that didn't resolve, and we'll fix it so
              nobody else hits the same wall.
            </p>
          </header>

          {/* Form */}
          <section className={styles.section}>
            <label htmlFor="url" className={styles.fieldLabel}>
              The URL you tried
            </label>
            <input
              id="url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={styles.input}
              spellCheck={false}
              autoComplete="off"
            />
            {url ? (
              <p className={styles.fieldHint}>
                Pre-filled from where you came from. Edit if it's wrong.
              </p>
            ) : null}
          </section>

          <section className={styles.section}>
            <label htmlFor="referrer" className={styles.fieldLabel}>
              Where did you arrive from?{' '}
              <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="referrer"
              type="text"
              value={referrer}
              onChange={(e) => setReferrer(e.target.value)}
              className={styles.input}
              placeholder="A search engine, a blog post, an internal Slack message…"
              spellCheck={false}
              autoComplete="off"
            />
          </section>

          <section className={styles.section}>
            <label htmlFor="description" className={styles.fieldLabel}>
              What were you looking for?{' '}
              <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className={styles.textarea}
              placeholder="If you can tell us the topic, we can suggest the right page."
            />
          </section>

          {/* Submission options */}
          <section className={styles.actions} aria-labelledby="sendHeading">
            <h2 id="sendHeading" className={styles.sectionTitle}>
              How Would You Like to Send This?
            </h2>
            <p className={styles.actionsHint}>
              Pick whichever works for you. Both include the URL,
              referrer, and description above.
            </p>

            <div className={styles.actionList}>
              <button
                type="button"
                onClick={handleCopy}
                className={styles.actionButtonPrimary}
                aria-live="polite"
              >
                {/* THE GLYPH IS A SIBLING OF THE TEXT, NOT A CHARACTER INSIDE IT — changed
                    2026-09-10. These three labels used to open with ✓ / ✗ / 📋, which meant
                    the platform's colour emoji font drew them: three different weights, two
                    colour models, and a size the button had no say in. Each is now the site's
                    own Lucide mark at the button's own currentColor.
                      `aria-hidden` comes from <Icon> itself and is right here: every branch
                    below pairs the mark with a full sentence, and the button already announces
                    its state through `aria-live` on the parent. */}
                {copyState === 'copied' ? (
                  <>
                    <Icon name="Confirmed" size={16} className={styles.actionIcon} />
                    Copied to clipboard
                  </>
                ) : copyState === 'error' ? (
                  <>
                    <Icon name="Failed" size={16} className={styles.actionIcon} />
                    Copy failed — try selecting text manually
                  </>
                ) : (
                  <>
                    <Icon name="Copy" size={16} className={styles.actionIcon} />
                    Copy report to clipboard
                  </>
                )}
              </button>

              <a
                href={buildMailtoUrl(url, referrer, description)}
                className={styles.actionButton}
                onClick={() => track('report_broken_link_submit', { channel: 'email', has_description: !!description })}
              >
                <Icon name="Email" size={16} className={styles.actionIcon} />
                Compose email
              </a>
            </div>
          </section>

          <hr className={styles.divider} />

          {/* While you're here — recovery */}
          <section aria-labelledby="recoverHeading">
            <h2 id="recoverHeading" className={styles.sectionTitle}>
              While you're here
            </h2>
            <p>
              You can also try finding the page yourself. Search via the
              box in the navigation bar at the top of this page, or jump
              to one of these:
            </p>
            {/* The `▸ ` that used to be a `content:` string on `.jumpsList li::before` is an
                <Icon> now, for the same reason the button labels above are. A generated text
                character cannot take a stroke weight, and this one drew a filled triangle
                beside a page whose every other mark is a 1.8px outline. */}
            <ul className={styles.jumpsList}>
              <li>
                <Icon name="Advance" size={15} className={styles.jumpIcon} />
                <span>
                  <Link to="/guides/get-oriented">Start here</Link>{' '}
                  — where to begin in the docs
                </span>
              </li>
              <li>
                <Icon name="Advance" size={15} className={styles.jumpIcon} />
                <span>
                  <Link to="/guides/quick-start">Quick Start tutorial</Link>{' '}
                  — read your first tag in 30 minutes
                </span>
              </li>
              <li>
                <Icon name="Advance" size={15} className={styles.jumpIcon} />
                <span>
                  <Link to="/api-reference/mqtt">MQTT API</Link>{' '}
                  — index of every IOTC MQTT command and event
                </span>
              </li>
              <li>
                <Icon name="Advance" size={15} className={styles.jumpIcon} />
                <span>
                  <Link to="/guides/diagnose-and-recover">Something not working?</Link>{' '}
                  — symptom-first failure index
                </span>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </Layout>
  );
}

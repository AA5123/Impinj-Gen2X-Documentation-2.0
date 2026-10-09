import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

/**
 * track — the single, canonical way to fire a product-analytics event.
 *
 * Every custom event on the site goes through here (there is intentionally no
 * PostHog autocapture — see src/client-modules/posthog). The event reaches the
 * PostHog singleton that the client module loads onto `window.posthog`.
 *
 * Contract:
 *  - SSR-safe: no-ops when there is no DOM (server prerender).
 *  - Inert without analytics: no-ops when PostHog is absent (ad-blocked, or
 *    POSTHOG_KEY unset so the client module never loaded anything).
 *  - Never throws: a capture failure must never break a click/keypress handler.
 *  - No `page` prop needed: PostHog auto-attaches $current_url / $pathname to
 *    every event, so callers pass only event-specific, low-cardinality props.
 */

/** Scalar-only event properties. Keep them low-cardinality and PII-free. */
export type TrackProps = Record<string, string | number | boolean | null | undefined>;

interface PostHogLike {
  capture: (event: string, properties?: TrackProps) => void;
}

function client(): PostHogLike | undefined {
  if (!ExecutionEnvironment.canUseDOM) return undefined;
  const ph = window.posthog;
  return ph && typeof ph.capture === 'function' ? (ph as PostHogLike) : undefined;
}

export function track(event: string, props: TrackProps = {}): void {
  const ph = client();
  if (!ph) return;
  try {
    ph.capture(event, props);
  } catch {
    /* best-effort: analytics must never interfere with the reading experience */
  }
}

// Ambient typing for the PostHog browser SDK singleton.
//
// The CDN loader (src/analytics/posthog-loader.ts) attaches the PostHog stub/SDK
// to `window.posthog`. Declaring it here once means `window.posthog` is typed
// across the app (e.g. src/analytics/track.ts) without per-call casts. It is
// optional because analytics is inert when POSTHOG_KEY is unset or blocked.
export {};

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
      init: (apiKey: string, config?: Record<string, unknown>) => void;
      [key: string]: unknown;
    };
  }
}

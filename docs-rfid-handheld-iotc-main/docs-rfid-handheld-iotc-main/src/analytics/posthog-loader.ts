/* eslint-disable */
/**
 * PostHog web loader — official install snippet + init.
 *
 * WHY the CDN snippet and not `import posthog from 'posthog-js'`:
 * this repo's CI installs dependencies with `npm ci` against a committed
 * package-lock.json (see .github/workflows/validate.yml). Adding an npm
 * dependency without regenerating the lockfile would break `npm ci`. The CDN
 * loader is a first-class, supported PostHog install method, needs no bundler
 * dependency, and works on static hosting (GitHub Pages).
 *
 * The bundle named twice below is PostHog's, hosted remotely, and is not a file in this
 * repository, so each mention carries its own lint-refs-ignore — the marker is per-line,
 * and a reference is not excused by an explanation sitting next to it.
 *
 * The block below is PostHog's official loader snippet, kept VERBATIM (hence the
 * eslint-disable) so it stays byte-compatible with the `array.js` bundle it  lint-refs-ignore
 * fetches. It: (1) defines `window.posthog` as a stub that queues any early
 * init/capture calls, then (2) asynchronously injects `array.js` from the  lint-refs-ignore
 * project's assets host — derived from `api_host` by swapping
 * `.i.posthog.com` → `-assets.i.posthog.com` (a plain first-party reverse-proxy
 * path is left untouched, so `<proxy>/static/array.js` also resolves) — which
 * replays the queued calls against the real SDK.
 *
 * `bootstrapPostHog` is only ever called from the browser (guarded by
 * ExecutionEnvironment.canUseDOM in the client module) and only when a project
 * key is configured.
 */

/** posthog.init() options object (see src/client-modules/posthog for the shape we pass). */
export type PostHogConfig = Record<string, unknown>;

export function bootstrapPostHog(apiKey: string, config: PostHogConfig): void {
  // prettier-ignore
  // @ts-expect-error -- vendored snippet: the leading-bang void IIFE trips TS1345 (window.posthog itself is globally typed in src/types/global.d.ts)
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,(window as any).posthog||[]);
  (window as any).posthog.init(apiKey, config);
}

/**
 * THIS FILE DECLARES NO SIDEBAR. It holds one type, used by the three sidebar files as a
 * compile-time guard, and it is in `sidebars/` because that is where its consumers are and
 * where the rule it enforces applies. Nothing points a `sidebarPath` at it, and nothing should.
 *
 * WHAT IT GUARDS, added 2026-09-07. `src/components/siteSections.ts` derives its `SidebarName`
 * union from the literal keys of the three sidebar objects Docusaurus loads:
 *
 *     type SidebarName = keyof typeof import('@site/sidebars/guides').default | …
 *
 * That only works while those objects keep their literal keys. `SidebarsConfig` is
 * `{[sidebarId: string]: SidebarItemConfig[] | …}`, so writing
 * `const sidebars: SidebarsConfig = {…}` DECLARES the index signature as the const's type and
 * the literal keys are gone. Each file therefore closes with `} satisfies SidebarsConfig`,
 * which checks the identical assignability without widening.
 *
 * WHY A GUARD AND NOT JUST A COMMENT SAYING SO. Restoring the annotation is the one change in
 * this area that breaks everything and shows no symptom. `keyof` collapses to `string`, `string`
 * swallows the whole union, `Record<SidebarName, SiteSection>` silently degrades to
 * `Record<string, SiteSection>` — the exact shape this work replaced — and then: the map still
 * typechecks, `sectionFor` still narrows, the build still passes, every linter still passes, and
 * the only consequence is that renaming a sidebar stops being a build error and starts being a
 * missing sidebar header in production. There is no test that fails. That is why this is a type
 * and not a note.
 *
 * WHY THE MESSAGE IS INSIDE THE TYPE. TypeScript has no custom diagnostics, but it prints the
 * type it could not assign to — so resolving to an object with an `ERROR` key puts the
 * explanation and the fix verbatim into the compiler output, at the line below the object that
 * was just broken:
 *
 *     error TS2322: Type 'boolean' is not assignable to type '{ ERROR: "Do not annotate …"; }'
 *
 * A guard resolving to `never` gives `Type 'boolean' is not assignable to type 'never'`, which
 * says nothing about what to do. `siteSections.ts` keeps such a guard as an aggregate backstop,
 * but it fires in a file the author was not editing; these fire where the mistake is.
 *
 * IT IS ALSO CHECKED FROM OUTSIDE THE TYPE SYSTEM, because a guard can simply be deleted and
 * everything still compiles — a guard nobody proves can fail is decoration.
 * `npm run lint:sidebar-sources` asserts all three files still carry a live one, and its
 * `--selftest` proves that check can fail. Same reasoning as `lint:static-orphans:selftest`.
 */

/**
 * `true` when `T`'s keys are string literals; an error-carrying object when they have widened
 * to `string`. Assign `true` to it: the assignment is what fails.
 */
export type LiteralSidebarKeys<T> = string extends keyof T
  ? {
      ERROR: 'The keys of `sidebars` have widened to `string`. Do not annotate the const with `: SidebarsConfig` — that declares its index signature and erases the literal sidebar names that src/components/siteSections.ts derives `SidebarName` from, which silently turns a renamed sidebar from a build error into a missing sidebar header. Close the object with `} satisfies SidebarsConfig` instead.';
    }
  : true;

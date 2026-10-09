// Type declarations for SCSS CSS Modules (docusaurus-plugin-sass).
// @docusaurus/module-type-aliases declares *.module.css but not *.module.scss,
// so `tsc` (npm run typecheck) cannot resolve scss-module imports without this.
declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

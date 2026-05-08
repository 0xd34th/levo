// Cetus Terminal ships its types from the package root (`dist/index.d.ts`).
// At runtime we import the CJS subpath directly to dodge a Turbopack module-
// format check (the package declares `"type": "commonjs"` while its `module`
// build uses ESM syntax). This ambient module declaration lets TypeScript
// resolve the same types for the subpath import.
declare module "@cetusprotocol/terminal/dist/cetus-swap.cjs.js" {
  export * from "@cetusprotocol/terminal";
}

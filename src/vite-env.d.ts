/// <reference types="vite/client" />

// Vite resolves CSS, asset and `?raw`/`?url` imports at build time, but nothing
// told TypeScript that. It went unnoticed because TypeScript 5 let an untyped
// side-effect import through silently; TypeScript 7 rejects it outright:
//
//   src/main.ts(1,8): error TS2882: Cannot find module or type declarations
//   for side-effect import of './styles/main.css'
//
// This is the reference the Vite scaffold normally ships and this project never
// had. It also supplies the types for import.meta.env.

/// <reference types="vite/client" />

// Vite serves .pdf files as static assets (the submittal cover template) — the
// import resolves to the asset URL.
declare module '*.pdf' {
  const src: string;
  export default src;
}

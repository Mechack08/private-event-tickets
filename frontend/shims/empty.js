/**
 * empty.js — shim for Node.js built-in modules that are referenced by
 * @midnight-ntwrk/* packages but are never actually called in the browser.
 *
 * Turbopack resolves `fs` (and potentially other Node built-ins) to this
 * file via the resolveAlias in next.config.ts.  The resulting empty object
 * satisfies the import without executing any file-system code.
 */
module.exports = {};

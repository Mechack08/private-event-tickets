/**
 * isomorphic-ws shim for the Turbopack browser bundle.
 *
 * Several @midnight-ntwrk/* packages import "isomorphic-ws" to get a
 * cross-environment WebSocket constructor.  In the browser, the native
 * WebSocket global is available, so we simply re-export it.
 *
 * Both a default export and a named `WebSocket` export are required because
 * different consumers use different import styles:
 *
 *   import WebSocket from "isomorphic-ws";       // default
 *   import { WebSocket } from "isomorphic-ws";   // named
 */

const WS = typeof WebSocket !== "undefined" ? WebSocket : null;

module.exports = WS;
module.exports.default = WS;
module.exports.WebSocket = WS;

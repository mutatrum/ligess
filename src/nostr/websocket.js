const Ws = require('ws')

// Patch ws EventEmitter behavior to prevent process crashes:
// nostr-tools' AbstractRelay explicitly sets `this.ws.onerror = null` inside `handleHardClose()`
// immediately after calling `this.ws.close()`. In `ws`, closing a socket while in the CONNECTING
// state triggers `abortHandshake`, which asynchronously calls `process.nextTick(emitErrorAndClose, websocket, err)`.
// When nextTick executes `ws.emit('error', err)`, because `ws.onerror` was cleared, the WebSocket
// EventEmitter has 0 error listeners. In Node.js, emitting an 'error' event on an EventEmitter with
// 0 listeners throws an unhandled error and terminates the Node.js process.
//
// By wrapping emit to safely return false when type === 'error' and there are 0 listeners,
// we prevent unhandled exception crashes while maintaining full compatibility with all normal error listeners.
if (!Ws._ligessPatched) {
  const originalEmit = Ws.prototype.emit
  Ws.prototype.emit = function (type, ...args) {
    if (type === 'error' && this.listenerCount('error') === 0) {
      return false
    }
    return originalEmit.call(this, type, ...args)
  }
  Ws._ligessPatched = true
}

globalThis.WebSocket = Ws

try {
  const { useWebSocketImplementation } = require('nostr-tools/pool')
  if (typeof useWebSocketImplementation === 'function') {
    useWebSocketImplementation(Ws)
  }
} catch (_) {}

try {
  const { useWebSocketImplementation } = require('nostr-tools/relay')
  if (typeof useWebSocketImplementation === 'function') {
    useWebSocketImplementation(Ws)
  }
} catch (_) {}

module.exports = Ws

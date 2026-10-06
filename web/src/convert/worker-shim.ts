// TensorFlow.js 3 checks `!window` (not `typeof window`) before falling back to
// setTimeout while polling the GPU, which throws in a worker. A `window` that exists
// but is undefined takes the fallback, and every `typeof window` check still sees none.
// Import this before anything that loads TensorFlow.js.

if (!('window' in globalThis)) {
  Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true })
}

export {}

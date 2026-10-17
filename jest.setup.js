import '@testing-library/jest-dom'

// Polyfill TextEncoder/TextDecoder for posthog-node
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

import { fakeBrowser } from '@webext-core/fake-browser';

// `wxt/browser` resolves to `globalThis.chrome` outside a real extension
// context, so stubbing `chrome` here makes storage.ts talk to the in-memory
// fake instead of throwing/hanging on an undefined API.
globalThis.chrome = fakeBrowser as unknown as typeof chrome;

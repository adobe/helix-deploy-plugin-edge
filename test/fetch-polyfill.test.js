/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */

import assert from 'assert';

describe('Fetch Polyfill Test', () => {
  let fetchPolyfill;
  let originalFetch;
  let originalCaches;
  let fetchCalls;

  before(async () => {
    // Import the module once
    fetchPolyfill = await import('../src/template/polyfills/fetch.js');
  });

  beforeEach(() => {
    // Save original fetch and caches
    originalFetch = global.fetch;
    originalCaches = global.caches;

    // Mock fetch to capture calls
    fetchCalls = [];
    global.fetch = (resource, options) => {
      fetchCalls.push({ resource, options });
      return Promise.resolve(new Response('mocked'));
    };
  });

  afterEach(() => {
    // Restore original fetch and caches
    global.fetch = originalFetch;
    global.caches = originalCaches;
  });

  describe('Cloudflare environment', () => {
    beforeEach(() => {
      // Mock Cloudflare's caches global
      global.caches = { default: {} };
    });

    it('passes through options as-is with decompress: true', async () => {
      await fetchPolyfill.fetch('https://example.com', { decompress: true });

      assert.strictEqual(fetchCalls.length, 1);
      assert.deepStrictEqual(fetchCalls[0].options, {
        decompress: true,
      });
    });

    it('passes through options as-is with decompress: false', async () => {
      await fetchPolyfill.fetch('https://example.com', { decompress: false });

      assert.strictEqual(fetchCalls.length, 1);
      assert.deepStrictEqual(fetchCalls[0].options, {
        decompress: false,
      });
    });

    it('passes through fastly options without modification', async () => {
      await fetchPolyfill.fetch('https://example.com', {
        fastly: { backend: 'custom' },
      });

      assert.strictEqual(fetchCalls.length, 1);
      assert.deepStrictEqual(fetchCalls[0].options, {
        fastly: { backend: 'custom' },
      });
    });

    it('preserves all options unchanged', async () => {
      await fetchPolyfill.fetch('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        decompress: true,
      });

      assert.strictEqual(fetchCalls.length, 1);
      assert.deepStrictEqual(fetchCalls[0].options, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        decompress: true,
      });
    });
  });

  describe('Non-Cloudflare environment (Fastly/Node.js)', () => {
    beforeEach(() => {
      // Ensure no Cloudflare caches global
      delete global.caches;
    });

    it('maps decompress: true to fastly.decompressGzip: true by default', async () => {
      await fetchPolyfill.fetch('https://example.com');

      assert.strictEqual(fetchCalls.length, 1);
      assert.strictEqual(fetchCalls[0].resource, 'https://example.com');
      assert.deepStrictEqual(fetchCalls[0].options, {
        fastly: { decompressGzip: true },
      });
    });

    it('maps decompress: true to fastly.decompressGzip: true explicitly', async () => {
      await fetchPolyfill.fetch('https://example.com', { decompress: true });

      assert.strictEqual(fetchCalls.length, 1);
      assert.deepStrictEqual(fetchCalls[0].options, {
        fastly: { decompressGzip: true },
      });
    });

    it('maps decompress: false to fastly.decompressGzip: false', async () => {
      await fetchPolyfill.fetch('https://example.com', { decompress: false });

      assert.strictEqual(fetchCalls.length, 1);
      assert.deepStrictEqual(fetchCalls[0].options, {
        fastly: { decompressGzip: false },
      });
    });

    it('explicit fastly options override decompress mapping', async () => {
      await fetchPolyfill.fetch('https://example.com', {
        decompress: true,
        fastly: { decompressGzip: false },
      });

      assert.strictEqual(fetchCalls.length, 1);
      assert.deepStrictEqual(fetchCalls[0].options, {
        fastly: { decompressGzip: false },
      });
    });

    it('preserves other fetch options', async () => {
      await fetchPolyfill.fetch('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        decompress: true,
      });

      assert.strictEqual(fetchCalls.length, 1);
      assert.strictEqual(fetchCalls[0].options.method, 'POST');
      assert.deepStrictEqual(fetchCalls[0].options.headers, {
        'Content-Type': 'application/json',
      });
      assert.deepStrictEqual(fetchCalls[0].options.fastly, {
        decompressGzip: true,
      });
    });

    it('merges fastly options with decompress mapping', async () => {
      await fetchPolyfill.fetch('https://example.com', {
        decompress: true,
        fastly: { backend: 'custom-backend' },
      });

      assert.strictEqual(fetchCalls.length, 1);
      assert.deepStrictEqual(fetchCalls[0].options, {
        fastly: {
          decompressGzip: true,
          backend: 'custom-backend',
        },
      });
    });
  });
});

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

describe('CacheOverride Polyfill Tests', () => {
  let CacheOverride;

  before(async () => {
    // Import the module once
    const modulePath = '../src/template/polyfills/fetch.js';
    const module = await import(modulePath);
    CacheOverride = module.CacheOverride;
  });

  afterEach(() => {
    // Clean up global state after each test
    delete global.CacheOverride;
    delete global.caches;
  });

  describe('CacheOverride Constructor', () => {
    it('accepts mode string and init object', () => {
      const override = new CacheOverride('override', { ttl: 3600 });
      assert.strictEqual(override.mode, 'override');
      assert.strictEqual(override.options.ttl, 3600);
    });

    it('accepts init object only (defaults to override mode)', () => {
      const override = new CacheOverride({ ttl: 7200 });
      assert.strictEqual(override.mode, 'override');
      assert.strictEqual(override.options.ttl, 7200);
    });

    it('accepts mode string only', () => {
      const override = new CacheOverride('pass');
      assert.strictEqual(override.mode, 'pass');
      assert.deepStrictEqual(override.options, {});
    });

    it('supports "none" mode', () => {
      const override = new CacheOverride('none');
      assert.strictEqual(override.mode, 'none');
    });

    it('supports "pass" mode', () => {
      const override = new CacheOverride('pass');
      assert.strictEqual(override.mode, 'pass');
    });

    it('supports "override" mode with options', () => {
      const override = new CacheOverride('override', {
        ttl: 3600,
        cacheKey: 'custom-key',
        surrogateKey: 'key1 key2',
      });
      assert.strictEqual(override.mode, 'override');
      assert.strictEqual(override.options.ttl, 3600);
      assert.strictEqual(override.options.cacheKey, 'custom-key');
      assert.strictEqual(override.options.surrogateKey, 'key1 key2');
    });
  });

  describe('Cloudflare Platform - toCloudflareOptions', () => {
    beforeEach(() => {
      // Simulate Cloudflare environment
      global.caches = { default: new Map() };
    });

    afterEach(() => {
      delete global.caches;
    });

    it('converts "pass" mode to cacheTtl: 0', () => {
      const override = new CacheOverride('pass');
      const cfOptions = override.toCloudflareOptions();
      assert.deepStrictEqual(cfOptions, { cacheTtl: 0 });
    });

    it('returns undefined for "none" mode', () => {
      const override = new CacheOverride('none');
      const cfOptions = override.toCloudflareOptions();
      assert.strictEqual(cfOptions, undefined);
    });

    it('converts ttl to cacheTtl', () => {
      const override = new CacheOverride({ ttl: 3600 });
      const cfOptions = override.toCloudflareOptions();
      assert.strictEqual(cfOptions.cacheTtl, 3600);
    });

    it('converts cacheKey', () => {
      const override = new CacheOverride({ cacheKey: 'my-custom-key' });
      const cfOptions = override.toCloudflareOptions();
      assert.strictEqual(cfOptions.cacheKey, 'my-custom-key');
    });

    it('converts surrogateKey to cacheTags array', () => {
      const override = new CacheOverride({ surrogateKey: 'tag1 tag2 tag3' });
      const cfOptions = override.toCloudflareOptions();
      assert.deepStrictEqual(cfOptions.cacheTags, ['tag1', 'tag2', 'tag3']);
    });

    it('handles multiple options together', () => {
      const override = new CacheOverride({
        ttl: 7200,
        cacheKey: 'combined-key',
        surrogateKey: 'a b c',
      });
      const cfOptions = override.toCloudflareOptions();
      assert.strictEqual(cfOptions.cacheTtl, 7200);
      assert.strictEqual(cfOptions.cacheKey, 'combined-key');
      assert.deepStrictEqual(cfOptions.cacheTags, ['a', 'b', 'c']);
    });

    it('ignores unsupported options for cross-platform compatibility', () => {
      const override = new CacheOverride({ ttl: 3600, swr: 86400, pci: true });

      // Only supported options should be stored
      assert.strictEqual(override.options.ttl, 3600);
      assert.strictEqual(override.options.swr, undefined);
      assert.strictEqual(override.options.pci, undefined);
    });

    it('returns undefined when no options are set', () => {
      const override = new CacheOverride({});
      const cfOptions = override.toCloudflareOptions();
      assert.strictEqual(cfOptions, undefined);
    });
  });

  describe('Fastly Platform - Native CacheOverride', () => {
    it('stores mode and supported cross-platform options', () => {
      const override = new CacheOverride('override', { ttl: 3600 });
      assert.strictEqual(override.mode, 'override');
      assert.strictEqual(override.options.ttl, 3600);
    });

    it('returns null native when not in Fastly environment', async () => {
      const override = new CacheOverride({ ttl: 7200 });
      await override.initNative();
      assert.strictEqual(override.native, null);
    });
  });

  describe('Fetch Wrapper - Basic Functionality', () => {
    it('CacheOverride provides toCloudflareOptions method', () => {
      const override = new CacheOverride({ ttl: 3600 });
      const cfOptions = override.toCloudflareOptions();
      assert.ok(cfOptions);
      assert.strictEqual(cfOptions.cacheTtl, 3600);
    });

    it('CacheOverride provides initNative method', async () => {
      const override = new CacheOverride({ ttl: 3600 });
      await override.initNative();
      // In non-Fastly environment, native should be null
      assert.strictEqual(override.native, null);
    });

    it('toCloudflareOptions handles all supported cross-platform options', () => {
      const override = new CacheOverride({
        ttl: 7200,
        cacheKey: 'test-key',
        surrogateKey: 'tag1 tag2',
      });
      const cfOptions = override.toCloudflareOptions();
      assert.strictEqual(cfOptions.cacheTtl, 7200);
      assert.strictEqual(cfOptions.cacheKey, 'test-key');
      assert.deepStrictEqual(cfOptions.cacheTags, ['tag1', 'tag2']);
    });
  });
});

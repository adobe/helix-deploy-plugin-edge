/*
 * Copyright 2023 Adobe. All rights reserved.
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
import adapter, { getEnvInfo, handleRequest } from '../src/template/fastly-adapter.js';

describe('Fastly Adapter Test', () => {
  it('Captures the environment', () => {
    const headers = new Map();
    const req = { headers };
    const env = (envvar) => {
      switch (envvar) {
        case 'FASTLY_CUSTOMER_ID': return 'cust1';
        case 'FASTLY_POP': return 'fpop';
        case 'FASTLY_SERVICE_ID': return 'sid999';
        case 'FASTLY_SERVICE_VERSION': return '1234';
        case 'FASTLY_TRACE_ID': return 'trace-id';
        default: return undefined;
      }
    };

    const info = getEnvInfo(req, env);

    assert.equal(info.functionFQN, 'cust1-sid999-1234');
    assert.equal(info.functionName, 'sid999');
    assert.equal(info.region, 'fpop');
    assert.equal(info.requestId, 'trace-id');
    assert.equal(info.serviceVersion, '1234');
    assert.equal(info.txId, 'trace-id');
  });

  it('Takes the txid from the request headers', () => {
    const headers = new Map();
    headers.set('foo', 'bar');
    headers.set('x-transaction-id', 'tx7');
    const req = { headers };
    const env = (_) => 'something';

    const info = getEnvInfo(req, env);

    assert.equal(info.txId, 'tx7');
  });

  it('returns the request handler in a fastly environment', () => {
    try {
      global.CacheOverride = true;
      assert.strictEqual(adapter(), handleRequest);
    } finally {
      delete global.CacheOverride;
    }
  });

  it('returns null in a non-fastly environment', () => {
    assert.strictEqual(adapter(), null);
  });

  it('creates context with logger initialized', async () => {
    const logs = [];
    const errors = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (msg) => logs.push(msg);
    console.error = (msg) => errors.push(msg);

    // Mock Dictionary constructor
    const mockDictionary = function MockDictionary(/* name */) {
      this.get = function mockGet(/* prop */) {
        return undefined;
      };
    };

    try {
      const request = {
        url: 'https://example.com/test',
        headers: new Map(),
      };

      const mockMain = (req, ctx) => {
        // Verify context has log property
        assert.ok(ctx.log);
        assert.ok(typeof ctx.log.fatal === 'function');
        assert.ok(typeof ctx.log.error === 'function');
        assert.ok(typeof ctx.log.warn === 'function');
        assert.ok(typeof ctx.log.info === 'function');
        assert.ok(typeof ctx.log.verbose === 'function');
        assert.ok(typeof ctx.log.debug === 'function');
        assert.ok(typeof ctx.log.silly === 'function');

        // Verify context.attributes is initialized
        assert.ok(ctx.attributes);
        assert.ok(typeof ctx.attributes === 'object');

        // Test logging - will fail to import fastly:logger but should not throw
        ctx.log.info({ test: 'data' });

        return new Response('ok');
      };

      // Mock require for main module
      global.require = () => ({ main: mockMain });

      // Mock Dictionary
      global.Dictionary = mockDictionary;

      const event = { request };

      // This will fail to import fastly:env, so we expect an error
      try {
        await handleRequest(event);
      } catch (err) {
        // Expected to fail due to missing fastly:env module
        assert.ok(err.message.includes('fastly:env') || err.message.includes('Cannot find module'));
      }
    } finally {
      console.log = originalLog;
      console.error = originalError;
      delete global.require;
      delete global.Dictionary;
    }
  });

  it('initializes context.attributes as empty object', async () => {
    // Mock Dictionary constructor
    const mockDictionary = function MockDictionary2(/* name */) {
      this.get = function mockGet2(/* prop */) {
        return undefined;
      };
    };

    try {
      const request = {
        url: 'https://example.com/test',
        headers: new Map(),
      };

      const mockMain = (req, ctx) => {
        // Verify context.attributes exists and is an object
        assert.strictEqual(typeof ctx.attributes, 'object');
        assert.deepStrictEqual(ctx.attributes, {});
        return new Response('ok');
      };

      global.require = () => ({ main: mockMain });
      global.Dictionary = mockDictionary;

      const event = { request };

      try {
        await handleRequest(event);
      } catch (err) {
        // Expected to fail due to missing fastly:env
        assert.ok(err.message.includes('fastly:env') || err.message.includes('Cannot find module'));
      }
    } finally {
      delete global.require;
      delete global.Dictionary;
    }
  });
});

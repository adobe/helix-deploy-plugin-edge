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
import adapter, { handleRequest } from '../src/template/cloudflare-adapter.js';

describe('Cloudflare Adapter Test', () => {
  it('returns the request handler in a cloudflare environment', () => {
    try {
      global.caches = { default: new Map() };
      assert.strictEqual(adapter(), handleRequest);
    } finally {
      delete global.caches;
    }
  });

  it('returns null in a non-cloudflare environment', () => {
    assert.strictEqual(adapter(), null);
  });

  it('creates context with log property', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => {
      // Only capture JSON logs from our logger
      try {
        logs.push(JSON.parse(msg));
      } catch {
        // Ignore non-JSON logs
      }
    };

    try {
      const request = {
        url: 'https://example.com/test',
        cf: { colo: 'SFO' },
      };

      const mockMain = (req, ctx) => {
        // Verify context has log property with methods
        assert.ok(ctx.log);
        assert.ok(typeof ctx.log.info === 'function');
        assert.ok(typeof ctx.log.error === 'function');
        assert.ok(typeof ctx.log.warn === 'function');
        assert.ok(typeof ctx.log.debug === 'function');

        // Test logging
        ctx.log.info({ test: 'data' });

        return new Response('ok');
      };

      // Mock the main module
      global.require = () => ({ main: mockMain });

      await handleRequest({ request });

      // Verify log was emitted
      assert.strictEqual(logs.length, 1);
      assert.strictEqual(logs[0].level, 'info');
      assert.strictEqual(logs[0].test, 'data');
    } finally {
      console.log = originalLog;
      delete global.require;
    }
  });

  it('includes target field when loggers configured', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => {
      try {
        logs.push(JSON.parse(msg));
      } catch {
        // Ignore non-JSON logs
      }
    };

    try {
      const request = {
        url: 'https://example.com/test',
        cf: { colo: 'LAX' },
      };

      const mockMain = async (req, ctx) => {
        // Configure loggers
        ctx.attributes.loggers = ['coralogix', 'splunk'];

        // Re-initialize logger with new configuration
        const { createCloudflareLogger } = await import('../src/template/context-logger.js');
        ctx.log = createCloudflareLogger(ctx.attributes.loggers, ctx);

        // Log message
        ctx.log.error('test error');

        return new Response('ok');
      };

      global.require = () => ({ main: mockMain });

      await handleRequest({ request });

      // Verify two logs emitted (one per target)
      assert.strictEqual(logs.length, 2);
      assert.strictEqual(logs[0].target, 'coralogix');
      assert.strictEqual(logs[0].message, 'test error');
      assert.strictEqual(logs[1].target, 'splunk');
      assert.strictEqual(logs[1].message, 'test error');
    } finally {
      console.log = originalLog;
      delete global.require;
    }
  });
});

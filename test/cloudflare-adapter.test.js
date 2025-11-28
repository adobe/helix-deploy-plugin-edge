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
import { handleRequest } from '../src/template/cloudflare-adapter.js';

describe('Cloudflare Adapter Test', () => {
  it('creates context with all log level methods', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      const request = {
        url: 'https://example.com/test',
        cf: { colo: 'SFO' },
      };

      const mockMain = (req, ctx) => {
        // Verify context has log property with all helix-log methods
        assert.ok(ctx.log);
        assert.ok(typeof ctx.log.fatal === 'function');
        assert.ok(typeof ctx.log.error === 'function');
        assert.ok(typeof ctx.log.warn === 'function');
        assert.ok(typeof ctx.log.info === 'function');
        assert.ok(typeof ctx.log.verbose === 'function');
        assert.ok(typeof ctx.log.debug === 'function');
        assert.ok(typeof ctx.log.silly === 'function');

        // Test logging (no loggers configured, should use "-")
        ctx.log.info({ test: 'data' });

        return new Response('ok');
      };

      // Mock the main module
      global.require = () => ({ main: mockMain });

      await handleRequest({ request });

      // Verify log was emitted in tab-separated format
      assert.strictEqual(logs.length, 1);
      const [target, level, body] = logs[0].split('\t');
      assert.strictEqual(target, '-');
      assert.strictEqual(level, 'info');
      const data = JSON.parse(body);
      assert.strictEqual(data.test, 'data');
    } finally {
      console.log = originalLog;
      delete global.require;
    }
  });

  it('dynamically uses loggers from context.attributes.loggers', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      const request = {
        url: 'https://example.com/test',
        cf: { colo: 'LAX' },
      };

      const mockMain = (req, ctx) => {
        // Configure loggers dynamically
        ctx.attributes.loggers = ['coralogix', 'splunk'];

        // Log message - should multiplex to both targets
        ctx.log.error('test error');

        return new Response('ok');
      };

      global.require = () => ({ main: mockMain });

      await handleRequest({ request });

      // Verify two logs emitted (one per target) in tab-separated format
      assert.strictEqual(logs.length, 2);

      // Parse first log
      const [target1, level1, body1] = logs[0].split('\t');
      assert.strictEqual(target1, 'coralogix');
      assert.strictEqual(level1, 'error');
      const data1 = JSON.parse(body1);
      assert.strictEqual(data1.message, 'test error');

      // Parse second log
      const [target2, level2, body2] = logs[1].split('\t');
      assert.strictEqual(target2, 'splunk');
      assert.strictEqual(level2, 'error');
      const data2 = JSON.parse(body2);
      assert.strictEqual(data2.message, 'test error');
    } finally {
      console.log = originalLog;
      delete global.require;
    }
  });
});

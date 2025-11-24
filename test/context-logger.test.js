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
import {
  normalizeLogData,
  enrichLogData,
  createCloudflareLogger,
  createFastlyLogger,
} from '../src/template/context-logger.js';

describe('Context Logger Test', () => {
  describe('normalizeLogData', () => {
    it('converts string to message object', () => {
      const result = normalizeLogData('test message');
      assert.deepStrictEqual(result, { message: 'test message' });
    });

    it('passes through object unchanged', () => {
      const input = { user_id: 123, action: 'login' };
      const result = normalizeLogData(input);
      assert.deepStrictEqual(result, { user_id: 123, action: 'login' });
    });

    it('converts non-string primitives to message object', () => {
      const result = normalizeLogData(42);
      assert.deepStrictEqual(result, { message: '42' });
    });

    it('handles null input', () => {
      const result = normalizeLogData(null);
      assert.deepStrictEqual(result, { message: 'null' });
    });
  });

  describe('enrichLogData', () => {
    it('adds context metadata to log data', () => {
      const data = { user_id: 123 };
      const context = {
        invocation: {
          requestId: 'req-123',
          transactionId: 'tx-456',
        },
        func: {
          name: 'my-function',
          version: 'v1.2.3',
          fqn: 'customer-my-function-v1.2.3',
        },
        runtime: {
          region: 'us-east-1',
        },
      };

      const result = enrichLogData(data, 'info', context);

      assert.strictEqual(result.level, 'info');
      assert.strictEqual(result.requestId, 'req-123');
      assert.strictEqual(result.transactionId, 'tx-456');
      assert.strictEqual(result.functionName, 'my-function');
      assert.strictEqual(result.functionVersion, 'v1.2.3');
      assert.strictEqual(result.functionFQN, 'customer-my-function-v1.2.3');
      assert.strictEqual(result.region, 'us-east-1');
      assert.strictEqual(result.user_id, 123);
      assert.ok(result.timestamp);
      assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.timestamp));
    });

    it('handles missing context properties gracefully', () => {
      const data = { foo: 'bar' };
      const context = {};

      const result = enrichLogData(data, 'error', context);

      assert.strictEqual(result.level, 'error');
      assert.strictEqual(result.foo, 'bar');
      assert.strictEqual(result.requestId, undefined);
      assert.strictEqual(result.functionName, undefined);
      assert.ok(result.timestamp);
    });
  });

  describe('createCloudflareLogger', () => {
    let originalLog;
    let originalError;

    beforeEach(() => {
      originalLog = console.log;
      originalError = console.error;
    });

    afterEach(() => {
      console.log = originalLog;
      console.error = originalError;
    });

    it('creates logger with all helix-log level methods', () => {
      const context = {
        invocation: { requestId: 'test-req' },
        func: { name: 'test-func' },
        runtime: { region: 'test-region' },
        attributes: { loggers: ['target1'] },
      };

      const logger = createCloudflareLogger(context);

      assert.ok(typeof logger.fatal === 'function');
      assert.ok(typeof logger.error === 'function');
      assert.ok(typeof logger.warn === 'function');
      assert.ok(typeof logger.info === 'function');
      assert.ok(typeof logger.verbose === 'function');
      assert.ok(typeof logger.debug === 'function');
      assert.ok(typeof logger.silly === 'function');
    });

    it('emits tab-separated logs (target, level, json)', () => {
      const logs = [];
      console.log = (msg) => logs.push(msg);
      const context = {
        invocation: { requestId: 'req-123' },
        func: { name: 'my-func' },
        runtime: { region: 'us-west' },
        attributes: { loggers: ['coralogix', 'splunk'] },
      };

      const logger = createCloudflareLogger(context);
      logger.info({ user_id: 456 });

      assert.strictEqual(logs.length, 2);

      // Parse first log (coralogix)
      const [target1, level1, body1] = logs[0].split('\t');
      assert.strictEqual(target1, 'coralogix');
      assert.strictEqual(level1, 'info');
      const data1 = JSON.parse(body1);
      assert.strictEqual(data1.user_id, 456);
      assert.strictEqual(data1.requestId, 'req-123');

      // Parse second log (splunk)
      const [target2, level2, body2] = logs[1].split('\t');
      assert.strictEqual(target2, 'splunk');
      assert.strictEqual(level2, 'info');
      const data2 = JSON.parse(body2);
      assert.strictEqual(data2.user_id, 456);
      assert.strictEqual(data2.requestId, 'req-123');
    });

    it('converts string input to message object', () => {
      const logs = [];
      console.log = (msg) => logs.push(msg);
      const context = {
        invocation: { requestId: 'req-789' },
        func: { name: 'test-func' },
        runtime: { region: 'eu-west' },
        attributes: { loggers: ['target1'] },
      };

      const logger = createCloudflareLogger(context);
      logger.error('Something went wrong');

      assert.strictEqual(logs.length, 1);
      const [target, level, body] = logs[0].split('\t');
      assert.strictEqual(target, 'target1');
      assert.strictEqual(level, 'error');
      const data = JSON.parse(body);
      assert.strictEqual(data.message, 'Something went wrong');
    });

    it('uses "-" when no loggers configured', () => {
      const logs = [];
      console.log = (msg) => logs.push(msg);
      const context = {
        invocation: { requestId: 'req-000' },
        func: { name: 'test-func' },
        runtime: { region: 'ap-south' },
        attributes: {},
      };

      const logger = createCloudflareLogger(context);
      logger.info({ test: 'data' });

      assert.strictEqual(logs.length, 1);
      const [target, level, body] = logs[0].split('\t');
      assert.strictEqual(target, '-');
      assert.strictEqual(level, 'info');
      const data = JSON.parse(body);
      assert.strictEqual(data.test, 'data');
    });

    it('supports all helix-log levels', () => {
      const logs = [];
      console.log = (msg) => logs.push(msg);
      const context = {
        invocation: { requestId: 'req-level' },
        func: { name: 'level-func' },
        runtime: { region: 'test' },
        attributes: { loggers: ['test'] },
      };

      const logger = createCloudflareLogger(context);
      logger.fatal('fatal msg');
      logger.error('error msg');
      logger.warn('warn msg');
      logger.info('info msg');
      logger.verbose('verbose msg');
      logger.debug('debug msg');
      logger.silly('silly msg');

      assert.strictEqual(logs.length, 7);

      const levels = logs.map((log) => log.split('\t')[1]);
      assert.deepStrictEqual(levels, ['fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'silly']);
    });

    it('dynamically checks context.attributes.loggers on each call', () => {
      const logs = [];
      console.log = (msg) => logs.push(msg);
      const context = {
        invocation: { requestId: 'req-dyn' },
        func: { name: 'dyn-func' },
        runtime: { region: 'test' },
        attributes: { loggers: ['target1'] },
      };

      const logger = createCloudflareLogger(context);
      logger.info('first');

      // Change logger configuration
      context.attributes.loggers = ['target1', 'target2'];
      logger.info('second');

      // Verify first call had 1 log
      assert.strictEqual(logs[0].split('\t')[0], 'target1');

      // Verify second call had 2 logs
      assert.strictEqual(logs[1].split('\t')[0], 'target1');
      assert.strictEqual(logs[2].split('\t')[0], 'target2');

      assert.strictEqual(logs.length, 3);
    });
  });

  describe('createFastlyLogger', () => {
    let originalLog;
    let originalError;
    let logs;
    let errors;

    beforeEach(() => {
      originalLog = console.log;
      originalError = console.error;
      logs = [];
      errors = [];
      console.log = (msg) => logs.push(msg);
      console.error = (msg) => errors.push(msg);
    });

    afterEach(() => {
      console.log = originalLog;
      console.error = originalError;
    });

    it('creates logger with all helix-log level methods', () => {
      const context = {
        invocation: { requestId: 'test-req' },
        func: { name: 'test-func' },
        runtime: { region: 'test-region' },
        attributes: {},
      };

      const logger = createFastlyLogger(context);

      assert.ok(typeof logger.fatal === 'function');
      assert.ok(typeof logger.error === 'function');
      assert.ok(typeof logger.warn === 'function');
      assert.ok(typeof logger.info === 'function');
      assert.ok(typeof logger.verbose === 'function');
      assert.ok(typeof logger.debug === 'function');
      assert.ok(typeof logger.silly === 'function');
    });

    it('handles fastly:logger import failure gracefully', async () => {
      const context = {
        invocation: { requestId: 'req-123' },
        func: { name: 'test-func' },
        runtime: { region: 'test' },
        attributes: { loggers: ['test-logger'] },
      };

      const logger = createFastlyLogger(context);

      // Attempt to log - should handle import failure gracefully
      logger.info({ test: 'message' });

      // Wait a bit for async import to fail
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Should have logged import error
      const importErrors = errors.filter((e) => e.includes('Failed to import fastly:logger'));
      assert.ok(importErrors.length > 0, 'Should log fastly:logger import error');
    });

    it('falls back to console when no loggers configured', async () => {
      const context = {
        invocation: { requestId: 'req-456' },
        func: { name: 'fallback-func' },
        runtime: { region: 'us-west' },
        attributes: {}, // No loggers configured
      };

      const logger = createFastlyLogger(context);
      logger.warn({ status: 'warning' });

      // Wait for async import to fail and fallback
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Should have console.log fallback with JSON
      const jsonLogs = logs.filter((log) => {
        try {
          const data = JSON.parse(log);
          return data.status === 'warning' && data.level === 'warn';
        } catch {
          return false;
        }
      });

      assert.ok(jsonLogs.length > 0, 'Should fallback to console.log with JSON');
    });

    it('normalizes and enriches log data before sending', async () => {
      const context = {
        invocation: { requestId: 'req-norm' },
        func: { name: 'norm-func', version: 'v1' },
        runtime: { region: 'eu-west' },
        attributes: {},
      };

      const logger = createFastlyLogger(context);

      // Log a string (should be normalized)
      logger.error('error message');

      // Wait for fallback
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Find the JSON log
      const jsonLogs = logs.filter((log) => {
        try {
          JSON.parse(log);
          return true;
        } catch {
          return false;
        }
      });

      assert.ok(jsonLogs.length > 0, 'Should have JSON logs');

      const logData = JSON.parse(jsonLogs[0]);
      assert.strictEqual(logData.message, 'error message', 'Should normalize string to message');
      assert.strictEqual(logData.level, 'error', 'Should have level');
      assert.strictEqual(logData.requestId, 'req-norm', 'Should enrich with requestId');
      assert.strictEqual(logData.functionName, 'norm-func', 'Should enrich with functionName');
      assert.ok(logData.timestamp, 'Should have timestamp');
    });

    it('handles all log levels', () => {
      const context = {
        invocation: { requestId: 'test' },
        func: { name: 'test' },
        runtime: { region: 'test' },
        attributes: {},
      };

      const logger = createFastlyLogger(context);

      // Should not throw for any level
      assert.doesNotThrow(() => logger.fatal('fatal'));
      assert.doesNotThrow(() => logger.error('error'));
      assert.doesNotThrow(() => logger.warn('warn'));
      assert.doesNotThrow(() => logger.info('info'));
      assert.doesNotThrow(() => logger.verbose('verbose'));
      assert.doesNotThrow(() => logger.debug('debug'));
      assert.doesNotThrow(() => logger.silly('silly'));
    });
  });
});

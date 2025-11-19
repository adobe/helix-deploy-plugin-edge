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
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);

      try {
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
      } finally {
        console.log = originalLog;
      }
    });

    it('converts string input to message object', () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);

      try {
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
      } finally {
        console.log = originalLog;
      }
    });

    it('uses "-" when no loggers configured', () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);

      try {
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
      } finally {
        console.log = originalLog;
      }
    });

    it('supports all helix-log levels', () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);

      try {
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
      } finally {
        console.log = originalLog;
      }
    });

    it('dynamically checks context.attributes.loggers on each call', () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);

      try {
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
      } finally {
        console.log = originalLog;
      }
    });
  });
});

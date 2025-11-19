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
    it('creates logger with level methods', () => {
      const context = {
        invocation: { requestId: 'test-req' },
        func: { name: 'test-func' },
        runtime: { region: 'test-region' },
      };

      const logger = createCloudflareLogger(['target1'], context);

      assert.ok(typeof logger.debug === 'function');
      assert.ok(typeof logger.info === 'function');
      assert.ok(typeof logger.warn === 'function');
      assert.ok(typeof logger.error === 'function');
    });

    it('emits one log per target with target field', () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(JSON.parse(msg));

      try {
        const context = {
          invocation: { requestId: 'req-123' },
          func: { name: 'my-func' },
          runtime: { region: 'us-west' },
        };

        const logger = createCloudflareLogger(['coralogix', 'splunk'], context);
        logger.info({ user_id: 456 });

        assert.strictEqual(logs.length, 2);

        // Check first log
        assert.strictEqual(logs[0].target, 'coralogix');
        assert.strictEqual(logs[0].level, 'info');
        assert.strictEqual(logs[0].user_id, 456);
        assert.strictEqual(logs[0].requestId, 'req-123');

        // Check second log
        assert.strictEqual(logs[1].target, 'splunk');
        assert.strictEqual(logs[1].level, 'info');
        assert.strictEqual(logs[1].user_id, 456);
        assert.strictEqual(logs[1].requestId, 'req-123');
      } finally {
        console.log = originalLog;
      }
    });

    it('converts string input to message object', () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(JSON.parse(msg));

      try {
        const context = {
          invocation: { requestId: 'req-789' },
          func: { name: 'test-func' },
          runtime: { region: 'eu-west' },
        };

        const logger = createCloudflareLogger(['target1'], context);
        logger.error('Something went wrong');

        assert.strictEqual(logs.length, 1);
        assert.strictEqual(logs[0].target, 'target1');
        assert.strictEqual(logs[0].level, 'error');
        assert.strictEqual(logs[0].message, 'Something went wrong');
      } finally {
        console.log = originalLog;
      }
    });

    it('falls back to console without target when no loggers configured', () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(JSON.parse(msg));

      try {
        const context = {
          invocation: { requestId: 'req-000' },
          func: { name: 'test-func' },
          runtime: { region: 'ap-south' },
        };

        const logger = createCloudflareLogger([], context);
        logger.info({ test: 'data' });

        assert.strictEqual(logs.length, 1);
        assert.strictEqual(logs[0].target, undefined);
        assert.strictEqual(logs[0].level, 'info');
        assert.strictEqual(logs[0].test, 'data');
      } finally {
        console.log = originalLog;
      }
    });

    it('uses correct log levels', () => {
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(JSON.parse(msg));

      try {
        const context = {
          invocation: { requestId: 'req-level' },
          func: { name: 'level-func' },
          runtime: { region: 'test' },
        };

        const logger = createCloudflareLogger(['test'], context);
        logger.debug('debug msg');
        logger.info('info msg');
        logger.warn('warn msg');
        logger.error('error msg');

        assert.strictEqual(logs.length, 4);
        assert.strictEqual(logs[0].level, 'debug');
        assert.strictEqual(logs[1].level, 'info');
        assert.strictEqual(logs[2].level, 'warn');
        assert.strictEqual(logs[3].level, 'error');
      } finally {
        console.log = originalLog;
      }
    });
  });
});

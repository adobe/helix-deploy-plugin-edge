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
/* eslint-disable max-classes-per-file */

import assert from 'assert';
import esmock from 'esmock';

// Mock SecretStore class
class MockSecretStore {
  constructor(name) {
    this.name = name;
  }

  async get(key) {
    // Return mock secrets based on store name and key
    const secrets = {
      action_secrets: {
        FOO: { plaintext: () => 'bar' },
        ACTION_ONLY: { plaintext: () => 'action-value' },
      },
      package_secrets: {
        HEY: { plaintext: () => 'ho' },
        PACKAGE_ONLY: { plaintext: () => 'package-value' },
      },
    };
    return secrets[this.name]?.[key] || null;
  }
}

// Mock fastly-runtime module
const mockFastlyRuntime = {
  getFastlyEnv: async () => ({
    env: (envvar) => {
      const envVars = {
        FASTLY_CUSTOMER_ID: 'test-customer',
        FASTLY_SERVICE_ID: 'test-service',
        FASTLY_SERVICE_VERSION: '42',
        FASTLY_TRACE_ID: 'trace-123',
        FASTLY_POP: 'SFO',
      };
      return envVars[envvar];
    },
  }),
  getSecretStore: async () => MockSecretStore,
  getLogger: async () => class MockLogger {
    constructor() {
      this.logs = [];
    }

    log(msg) {
      this.logs.push(msg);
    }
  },
};

describe('Fastly Adapter Test', () => {
  let getEnvInfo;
  let handleRequest;

  before(async () => {
    // Import with mocked fastly-runtime module
    const adapter = await esmock('../src/template/fastly-adapter.js', {
      '../src/template/fastly-runtime.js': mockFastlyRuntime,
    });
    getEnvInfo = adapter.getEnvInfo;
    handleRequest = adapter.handleRequest;
  });

  describe('getEnvInfo', () => {
    it('captures the environment', () => {
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

    it('takes the txid from the request headers', () => {
      const headers = new Map();
      headers.set('foo', 'bar');
      headers.set('x-transaction-id', 'tx7');
      const req = { headers };
      const env = () => 'something';

      const info = getEnvInfo(req, env);

      assert.equal(info.txId, 'tx7');
    });
  });

  describe('handleRequest', () => {
    it('creates context with correct structure', async () => {
      const request = {
        url: 'https://example.com/test/path',
        headers: new Map(),
      };

      let capturedContext;
      const mockMain = (req, ctx) => {
        capturedContext = ctx;
        return new Response('ok');
      };

      global.require = () => ({ main: mockMain });

      try {
        await handleRequest({ request });

        // Verify context structure
        assert.ok(capturedContext);
        assert.equal(capturedContext.runtime.name, 'compute-at-edge');
        assert.equal(capturedContext.runtime.region, 'SFO');
        assert.equal(capturedContext.func.name, 'test-service');
        assert.equal(capturedContext.func.version, '42');
        assert.equal(capturedContext.func.fqn, 'test-customer-test-service-42');
        assert.deepStrictEqual(capturedContext.attributes, {});
      } finally {
        delete global.require;
      }
    });

    it('creates context with logger initialized', async () => {
      const request = {
        url: 'https://example.com/test',
        headers: new Map(),
      };

      let capturedContext;
      const mockMain = (req, ctx) => {
        capturedContext = ctx;
        return new Response('ok');
      };

      global.require = () => ({ main: mockMain });

      try {
        await handleRequest({ request });

        // Verify logger methods exist
        assert.ok(capturedContext.log);
        assert.ok(typeof capturedContext.log.fatal === 'function');
        assert.ok(typeof capturedContext.log.error === 'function');
        assert.ok(typeof capturedContext.log.warn === 'function');
        assert.ok(typeof capturedContext.log.info === 'function');
        assert.ok(typeof capturedContext.log.verbose === 'function');
        assert.ok(typeof capturedContext.log.debug === 'function');
        assert.ok(typeof capturedContext.log.silly === 'function');
      } finally {
        delete global.require;
      }
    });

    it('provides env proxy that accesses action secrets first', async () => {
      const request = {
        url: 'https://example.com/test',
        headers: new Map(),
      };

      let capturedContext;
      const mockMain = (req, ctx) => {
        capturedContext = ctx;
        return new Response('ok');
      };

      global.require = () => ({ main: mockMain });

      try {
        await handleRequest({ request });

        // Access env through proxy - should get action secret
        const fooValue = await capturedContext.env.FOO;
        assert.equal(fooValue, 'bar');

        // Action-only secret
        const actionValue = await capturedContext.env.ACTION_ONLY;
        assert.equal(actionValue, 'action-value');
      } finally {
        delete global.require;
      }
    });

    it('provides env proxy that falls back to package secrets', async () => {
      const request = {
        url: 'https://example.com/test',
        headers: new Map(),
      };

      let capturedContext;
      const mockMain = (req, ctx) => {
        capturedContext = ctx;
        return new Response('ok');
      };

      global.require = () => ({ main: mockMain });

      try {
        await handleRequest({ request });

        // Package-only secret (not in action_secrets)
        const packageValue = await capturedContext.env.PACKAGE_ONLY;
        assert.equal(packageValue, 'package-value');

        // HEY is only in package_secrets
        const heyValue = await capturedContext.env.HEY;
        assert.equal(heyValue, 'ho');
      } finally {
        delete global.require;
      }
    });

    it('returns undefined for non-existent secrets', async () => {
      const request = {
        url: 'https://example.com/test',
        headers: new Map(),
      };

      let capturedContext;
      const mockMain = (req, ctx) => {
        capturedContext = ctx;
        return new Response('ok');
      };

      global.require = () => ({ main: mockMain });

      try {
        await handleRequest({ request });

        const nonExistent = await capturedContext.env.NON_EXISTENT;
        assert.equal(nonExistent, undefined);
      } finally {
        delete global.require;
      }
    });

    it('extracts path from request URL', async () => {
      const request = {
        url: 'https://example.com/my/custom/path',
        headers: new Map(),
      };

      let capturedContext;
      const mockMain = (req, ctx) => {
        capturedContext = ctx;
        return new Response('ok');
      };

      global.require = () => ({ main: mockMain });

      try {
        await handleRequest({ request });

        assert.equal(capturedContext.pathInfo.suffix, '/my/custom/path');
      } finally {
        delete global.require;
      }
    });

    it('handles errors and returns 500 response', async () => {
      const request = {
        url: 'https://example.com/test',
        headers: new Map(),
      };

      const mockMain = () => {
        throw new Error('Test error');
      };

      global.require = () => ({ main: mockMain });

      try {
        const response = await handleRequest({ request });

        assert.equal(response.status, 500);
        const text = await response.text();
        assert.ok(text.includes('Test error'));
      } finally {
        delete global.require;
      }
    });
  });
});

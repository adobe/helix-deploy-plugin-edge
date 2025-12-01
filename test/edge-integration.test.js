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
/* eslint-disable no-underscore-dangle */
import assert from 'assert';
import { config } from 'dotenv';
import { CLI } from '@adobe/helix-deploy';
import fse from 'fs-extra';
import path from 'path';
import { createTestRoot, TestLogger } from './utils.js';

// Only load .env if environment variables aren't already set (e.g., in CI)
if (!process.env.HLX_FASTLY_AUTH || !process.env.CLOUDFLARE_AUTH) {
  config();
}

describe('Edge Integration Test', () => {
  let testRoot;
  let origPwd;
  const deployments = {};

  before(async function deployToBothPlatforms() {
    this.timeout(600000); // 10 minutes for deployment

    // Fail explicitly if required credentials are missing
    if (!process.env.HLX_FASTLY_AUTH) {
      throw new Error('HLX_FASTLY_AUTH environment variable is required for Fastly integration tests. Please set it in GitHub repository secrets.');
    }
    if (!process.env.CLOUDFLARE_AUTH) {
      throw new Error('CLOUDFLARE_AUTH environment variable is required for Cloudflare integration tests. Please set it in GitHub repository secrets.');
    }

    testRoot = await createTestRoot();
    origPwd = process.cwd();

    // Copy the edge-action fixture
    await fse.copy(path.resolve(__rootdir, 'test', 'fixtures', 'edge-action'), testRoot);
    process.chdir(testRoot);

    const fastlyServiceID = '1yv1Wl7NQCFmNBkW4L8htc';
    const fastlyTestDomain = 'possibly-working-sawfish';

    // eslint-disable-next-line no-console
    console.log('--: Starting deployment to Cloudflare and Fastly...');

    // Deploy to both platforms with a single CLI call using multiple --target arguments
    const builder = await new CLI()
      .prepare([
        '--build',
        '--verbose',
        '--deploy',
        '--target', 'cloudflare',
        '--target', 'c@e',
        '--plugin', path.resolve(__rootdir, 'src', 'index.js'),
        '--arch', 'edge',
        // Cloudflare config
        '--cloudflare-email', 'lars@trieloff.net',
        '--cloudflare-account-id', '155ec15a52a18a14801e04b019da5e5a',
        '--cloudflare-test-domain', 'minivelos',
        '--cloudflare-auth', process.env.CLOUDFLARE_AUTH,
        // Fastly config
        '--compute-service-id', fastlyServiceID,
        '--compute-test-domain', fastlyTestDomain,
        '--fastly-gateway', 'deploy-test.anywhere.run',
        '--fastly-service-id', '4u8SAdblhzzbXntBYCjhcK',
        // Shared config
        '--package.params', 'HEY=ho',
        '--package.params', 'ZIP=zap',
        '--update-package', 'true',
        '-p', 'FOO=bar',
        '--directory', testRoot,
        '--entryFile', 'src/index.js',
        '--bundler', 'esbuild',
        '--esm', 'false',
      ]);
    builder.cfg._logger = new TestLogger();

    const res = await builder.run();
    assert.ok(res, 'Deployment should succeed');

    deployments.cloudflare = {
      url: 'https://simple-package--simple-project.minivelos.workers.dev',
      logger: builder.cfg._logger,
    };
    deployments.fastly = {
      url: `https://${fastlyTestDomain}.edgecompute.app`,
      logger: builder.cfg._logger,
    };

    // eslint-disable-next-line no-console
    console.log('--: Deployment completed');
    // eslint-disable-next-line no-console
    console.log(`--: Cloudflare URL: ${deployments.cloudflare.url}`);
    // eslint-disable-next-line no-console
    console.log(`--: Fastly URL: ${deployments.fastly.url}`);
  });

  after(() => {
    process.chdir(origPwd);
  });

  // Test suite that runs against both platforms
  ['cloudflare', 'fastly'].forEach((platform) => {
    describe(`${platform.charAt(0).toUpperCase() + platform.slice(1)} Platform Integration`, () => {
      let baseUrl;

      before(() => {
        baseUrl = deployments[platform].url;
      });

      it('should access environment variables correctly', async () => {
        // eslint-disable-next-line no-console
        console.log(`Testing ${platform}: ${baseUrl}/201`);
        const response = await fetch(`${baseUrl}/201`);
        const text = await response.text();

        assert.ok(response.status === 200, `Response should be 200, got ${response.status}`);
        assert.ok(text.includes('ok: ho bar'), `Response should include env vars: ${text}`);
        // Only accept successful responses (200, 201) - never accept 503 or other errors
        assert.ok(text.includes('– 200') || text.includes('– 201'), `Response should include successful backend status (200 or 201): ${text}`);
      });

      it('should handle logging functionality', async () => {
        const response = await fetch(`${baseUrl}/?operation=verbose`);
        const text = await response.text();

        assert.ok(response.status === 200, `Logging endpoint should return 200, got ${response.status}`);
        assert.ok(text.includes('"status":"ok"'), `Response should include status ok: ${text}`);
        assert.ok(text.includes('"logging":"enabled"'), `Response should indicate logging is enabled: ${text}`);
        assert.ok(text.includes('"timestamp"'), `Response should include timestamp: ${text}`);
      });

      it('should support TTL cache override', async () => {
        const response = await fetch(`${baseUrl}/cache-override-ttl`);
        const text = await response.text();

        assert.ok(response.status === 200, `Cache override TTL should return 200, got ${response.status}`);
        assert.ok(text.includes('cache-override-ttl'), `Response should include route name: ${text}`);
        assert.ok(text.includes('ttl=3600'), `Response should include TTL parameter: ${text}`);
        // Only accept successful responses (200, 201) - never accept 503 or other errors
        assert.ok(text.includes('– 200') || text.includes('– 201'), `Response should include successful backend status (200 or 201): ${text}`);
      });

      it('should support pass mode cache override', async () => {
        const response = await fetch(`${baseUrl}/cache-override-pass`);
        const text = await response.text();

        assert.ok(response.status === 200, `Cache override pass should return 200, got ${response.status}`);
        assert.ok(text.includes('cache-override-pass'), `Response should include route name: ${text}`);
        assert.ok(text.includes('mode=pass'), `Response should include pass mode: ${text}`);
        // Only accept successful responses (200, 201) - never accept 503 or other errors
        assert.ok(text.includes('– 200') || text.includes('– 201'), `Response should include successful backend status (200 or 201): ${text}`);
      });

      it('should support custom cache key override', async () => {
        const response = await fetch(`${baseUrl}/cache-override-key`);
        const text = await response.text();

        assert.ok(response.status === 200, `Cache override key should return 200, got ${response.status}`);
        assert.ok(text.includes('cache-override-key'), `Response should include route name: ${text}`);
        assert.ok(text.includes('cacheKey=test-key'), `Response should include cache key: ${text}`);
        // Only accept successful responses (200, 201) - never accept 503 or other errors
        assert.ok(text.includes('– 200') || text.includes('– 201'), `Response should include successful backend status (200 or 201): ${text}`);
      });

      it('should handle package and action parameters correctly', async () => {
        const response = await fetch(`${baseUrl}/201`);
        const text = await response.text();

        // Verify both package params (HEY=ho) and action params (FOO=bar) are accessible
        assert.ok(text.includes('ho'), `Response should include package param HEY=ho: ${text}`);
        assert.ok(text.includes('bar'), `Response should include action param FOO=bar: ${text}`);

        // Verify the service/function identifier is present
        if (platform === 'fastly') {
          assert.ok(text.includes('1yv1Wl7NQCFmNBkW4L8htc'), `Response should include Fastly service ID: ${text}`);
        } else {
          // Cloudflare now returns the function name extracted from hostname
          assert.ok(text.includes('simple-package--simple-project'), `Response should include Cloudflare function name: ${text}`);
        }
      });
    });
  });
});

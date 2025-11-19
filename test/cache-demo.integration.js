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
import path, { resolve } from 'path';
import { createTestRoot, TestLogger } from './utils.js';

config();

describe('CacheOverride Demo Integration Test', () => {
  let testRoot;
  let origPwd;

  beforeEach(async () => {
    testRoot = await createTestRoot();
    origPwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(origPwd);
    await fse.remove(testRoot);
  });

  it('Deploy cache-demo to Fastly Compute@Edge', async () => {
    const serviceID = '1yv1Wl7NQCFmNBkW4L8htc';

    await fse.copy(path.resolve(__rootdir, 'test', 'fixtures', 'cache-demo'), testRoot);
    process.chdir(testRoot);

    const builder = await new CLI()
      .prepare([
        '--build',
        '--plugin', resolve(__rootdir, 'src', 'index.js'),
        '--verbose',
        '--deploy',
        '--target', 'c@e',
        '--arch', 'edge',
        '--compute-service-id', serviceID,
        '--compute-test-domain', 'possibly-working-sawfish',
        '--package.name', 'CacheDemo',
        '--fastly-gateway', 'deploy-test.anywhere.run',
        '--fastly-service-id', '4u8SAdblhzzbXntBYCjhcK',
        '--test', '/cache-demo/',
        '--directory', testRoot,
        '--entryFile', 'src/index.js',
        '--bundler', 'webpack',
        '--esm', 'false',
      ]);
    builder.cfg._logger = new TestLogger();

    const res = await builder.run();
    assert.ok(res);
    const out = builder.cfg._logger.output;

    // Verify deployment
    assert.ok(out.indexOf('possibly-working-sawfish.edgecompute.app') > 0, out);
    assert.ok(out.indexOf('dist/CacheDemo/fastly-bundle.tar.gz') > 0, out);

    // Verify the response contains expected structure
    assert.ok(out.indexOf('CacheOverride API Demo') > 0, 'Should return API info');
    assert.ok(out.indexOf('/cache-demo/long') > 0, 'Should list long cache route');
    assert.ok(out.indexOf('/cache-demo/short') > 0, 'Should list short cache route');
  }).timeout(10000000);

  it.skip('Deploy cache-demo to Cloudflare', async () => {
    await fse.copy(path.resolve(__rootdir, 'test', 'fixtures', 'cache-demo'), testRoot);
    process.chdir(testRoot);

    const builder = await new CLI()
      .prepare([
        '--build',
        '--verbose',
        '--deploy',
        '--target', 'cloudflare',
        '--plugin', path.resolve(__rootdir, 'src', 'index.js'),
        '--arch', 'edge',
        '--cloudflare-email', 'lars@trieloff.net',
        '--cloudflare-account-id', 'b4adf6cfdac0918eb6aa5ad033da0747',
        '--cloudflare-test-domain', 'rockerduck',
        '--test', '/cache-demo/',
        '--directory', testRoot,
        '--entryFile', 'src/index.js',
        '--bundler', 'webpack',
        '--esm', 'false',
      ]);
    builder.cfg._logger = new TestLogger();

    const res = await builder.run();
    assert.ok(res);
    const out = builder.cfg._logger.output;

    // Verify deployment
    assert.ok(out.indexOf('helix-services--cache-demo.rockerduck.workers.dev') > 0, out);

    // Verify the response contains expected structure
    assert.ok(out.indexOf('CacheOverride API Demo') > 0, 'Should return API info');
    assert.ok(out.indexOf('/cache-demo/long') > 0, 'Should list long cache route');
  }).timeout(10000000);

  it('Build cache-demo and verify CacheOverride is bundled', async () => {
    await fse.copy(path.resolve(__rootdir, 'test', 'fixtures', 'cache-demo'), testRoot);
    process.chdir(testRoot);

    const builder = await new CLI()
      .prepare([
        '--build',
        '--plugin', resolve(__rootdir, 'src', 'index.js'),
        '--target', 'wsk',
        '--arch', 'edge',
        '--directory', testRoot,
        '--entryFile', 'src/index.js',
        '--bundler', 'webpack',
        '--esm', 'false',
      ]);
    builder.cfg._logger = new TestLogger();

    await builder.run();

    // Check that bundle was created
    const bundlePath = path.resolve(testRoot, 'dist', 'helix-services', 'cache-demo.zip');
    assert.ok(await fse.pathExists(bundlePath), 'Bundle should be created');

    const out = builder.cfg._logger.output;
    assert.ok(out.indexOf('cache-demo.zip') > 0, 'Output should mention the bundle');
  }).timeout(10000000);
});

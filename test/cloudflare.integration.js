/*
 * Copyright 2021 Adobe. All rights reserved.
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
import fse from 'fs-extra';
import path from 'path';
import { config } from 'dotenv';
import { CLI } from '@adobe/helix-deploy';
import { createTestRoot, TestLogger } from './utils.js';

// Only load .env if environment variables aren't already set (e.g., in CI)
if (!process.env.HLX_FASTLY_AUTH || !process.env.CLOUDFLARE_AUTH) {
  config();
}

describe('Cloudflare Integration Test', () => {
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

  // Skip integration tests if Cloudflare credentials are not available
  const skipIfNoCloudflareAuth = !process.env.CLOUDFLARE_AUTH ? it.skip : it;

  skipIfNoCloudflareAuth('Deploy a pure action to Cloudflare', async () => {
    // Fail explicitly if required credentials are missing
    if (!process.env.CLOUDFLARE_AUTH) {
      throw new Error('CLOUDFLARE_AUTH environment variable is required for Cloudflare integration tests. Please set it in GitHub repository secrets.');
    }

    await fse.copy(path.resolve(__rootdir, 'test', 'fixtures', 'edge-action'), testRoot);
    process.chdir(testRoot); // need to change .cwd() for yargs to pickup `wsk` in package.json
    const builder = await new CLI()
      .prepare([
        '--build',
        '--verbose',
        '--deploy',
        '--target', 'cloudflare',
        '--plugin', path.resolve(__rootdir, 'src', 'index.js'),
        '--arch', 'edge',
        '--cloudflare-email', 'lars@trieloff.net',
        '--cloudflare-account-id', '155ec15a52a18a14801e04b019da5e5a',
        '--cloudflare-test-domain', 'minivelos',
        '--cloudflare-auth', process.env.CLOUDFLARE_AUTH,
        '--package.params', 'HEY=ho',
        '--package.params', 'ZIP=zap',
        '--update-package', 'true',
        '-p', 'FOO=bar',
        '--test', '/foo',
        '--directory', testRoot,
        '--entryFile', 'src/index.js',
        '--bundler', 'esbuild',
        '--esm', 'false',
      ]);
    builder.cfg._logger = new TestLogger();

    const res = await builder.run();
    assert.ok(res);
    const out = builder.cfg._logger.output;
    assert.ok(out.indexOf('https://simple-package--simple-project.minivelos.workers.dev') > 0, out);
  }).timeout(10000000);
});

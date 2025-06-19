/*
 * Copyright 2020 Adobe. All rights reserved.
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
import path, { resolve } from 'path';
import fse from 'fs-extra';
import nock from 'nock';
import { CLI } from '@adobe/helix-deploy';
import { createTestRoot, TestLogger } from './utils.js';

describe('Deploy Test', () => {
  let testRoot;
  let origPwd;
  let origEnv;

  beforeEach(async () => {
    testRoot = await createTestRoot();
    origPwd = process.cwd();
    origEnv = { ...process.env };

    // set fake wsk props
    process.env.WSK_NAMESPACE = 'foobar';
    process.env.WSK_APIHOST = 'https://example.com';
    process.env.WSK_AUTH = 'fake-key';
  });

  afterEach(async () => {
    process.chdir(origPwd);
    await fse.remove(testRoot);

    process.env = origEnv;
  });

  it('deploys a cloudflare worker on edge arch alone', async () => {
    await fse.copy(path.resolve(__rootdir, 'test', 'fixtures', 'cf-worker'), testRoot);

    let body;
    nock('https://api.cloudflare.com')
      .get('/client/v4/accounts/123/workers/scripts/default--test-worker/script-settings')
      .reply(404)
      .post('/client/v4/accounts/123/storage/kv/namespaces', (b) => {
        body = b;
        return true;
      })
      .reply(200, JSON.stringify({ result: { id: 'test-namespace' } }))
      .put('/client/v4/accounts/123/workers/scripts/default--test-worker')
      .reply(200);

    process.chdir(testRoot); // need to change .cwd() for yargs to pickup `wsk` in package.json
    const builder = await new CLI()
      .prepare([
        '--build',
        '--plugin', resolve(__rootdir, 'src', 'index.js'),
        '--target', 'cloudflare',
        '--arch', 'edge',
        '--verbose',
        '--deploy',
        '--entryFile', 'index.js',
        '--directory', testRoot,
        '--cloudflare-email', 'fake@email.test',
        '--cloudflare-account-id', '123',
        '--cloudflare-auth', 'test-token',
        '--name', 'test-worker',
        '--bundler', 'webpack',
        '--esm', 'false',
      ]);
    builder.cfg._logger = new TestLogger();

    const res = await builder.run();

    assert.deepEqual(body, { title: 'default--secrets' });

    assert.deepEqual(res, {
      cloudflare: {
        name: 'cloudflare;host=https://null',
        url: 'default--test-worker',
      },
    });
  }).timeout(15000);

  it('deploys a cloudflare worker and restores existing script settings', async () => {
    await fse.copy(path.resolve(__rootdir, 'test', 'fixtures', 'cf-worker'), testRoot);

    const bodies = { namespaces: undefined, settings: undefined };
    nock('https://api.cloudflare.com')
      .get('/client/v4/accounts/123/workers/scripts/default--test-worker/script-settings')
      .reply(200, JSON.stringify({
        success: true,
        result: {
          logpush: true,
          tail_consumers: [
            {
              environment: 'production',
              namespace: 'my-namespace',
              service: 'my-log-consumer',
            },
          ],
        },
      }))
      .post('/client/v4/accounts/123/storage/kv/namespaces', (b) => {
        bodies.namespaces = b;
        return true;
      })
      .reply(200, JSON.stringify({ result: { id: 'test-namespace' } }))
      .put('/client/v4/accounts/123/workers/scripts/default--test-worker')
      .reply(200)
      .patch('/client/v4/accounts/123/workers/scripts/default--test-worker/script-settings', (b) => {
        bodies.settings = b;
        return true;
      })
      .reply(200);

    process.chdir(testRoot); // need to change .cwd() for yargs to pickup `wsk` in package.json
    const builder = await new CLI()
      .prepare([
        '--build',
        '--plugin', resolve(__rootdir, 'src', 'index.js'),
        '--target', 'cloudflare',
        '--arch', 'edge',
        '--verbose',
        '--deploy',
        '--entryFile', 'index.js',
        '--directory', testRoot,
        '--cloudflare-email', 'fake@email.test',
        '--cloudflare-account-id', '123',
        '--cloudflare-auth', 'test-token',
        '--name', 'test-worker',
        '--bundler', 'webpack',
        '--esm', 'false',
      ]);
    builder.cfg._logger = new TestLogger();

    const res = await builder.run();

    assert.deepEqual(bodies.namespaces, { title: 'default--secrets' });
    assert.deepEqual(bodies.settings, {
      logpush: true,
      tail_consumers: [
        {
          environment: 'production',
          namespace: 'my-namespace',
          service: 'my-log-consumer',
        },
      ],
    });

    assert.deepEqual(res, {
      cloudflare: {
        name: 'cloudflare;host=https://null',
        url: 'default--test-worker',
      },
    });
  }).timeout(15000);
});

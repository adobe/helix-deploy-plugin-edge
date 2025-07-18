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
import fse from 'fs-extra';
import path, { resolve } from 'path';
import { CLI } from '@adobe/helix-deploy';
import { h1NoCache } from '@adobe/fetch';
import { createTestRoot, TestLogger } from './utils.js';

describe.skip('Gateway Integration Test', () => {
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

  it('Deploy to all Runtimes', async function test() {
    this.retries(3);
    await fse.copy(path.resolve(__rootdir, 'test', 'fixtures', 'simple'), testRoot);

    process.chdir(testRoot); // need to change .cwd() for yargs to pickup `wsk` in package.json
    const builder = new CLI()
      .prepare([
        '--build',
        '--verbose',
        '--deploy',
        '--plugin', resolve(__rootdir, 'src', 'index.js'),
        '--target', 'wsk',
        '--target', 'aws',
        '--target', 'google',
        '--aws-region', 'us-east-1',
        '--aws-api', 'lqmig3v5eb',
        '--aws-role', 'arn:aws:iam::118435662149:role/helix-lambda-role',
        '--google-key-file', `${process.env.HOME}/.helix-google.json`,
        '--google-email', 'cloud-functions-dev@helix-225321.iam.gserviceaccount.com',
        '--google-project-id', 'helix-225321',
        '--google-region', 'us-central1',
        '--package.params', 'HEY=ho',
        '--update-package', 'true',
        '--check-interval', 30000000,
        '-p', 'FOO=bar',
        '--test', '/foo',
        '--checkpath', '/foo',
        '--directory', testRoot,
        '--entryFile', 'index.js',
        '--coralogix-token', process.env.CORALOGIX_TOKEN,
        '-l', 'latest',
        '-l', 'major',
        '-l', 'minor',
        '--bundler', 'webpack',
        '--esm', 'false',
      ]);
    builder.cfg._logger = new TestLogger();

    const res = await builder.run();
    assert.ok(res);
    const out = builder.cfg._logger.output;
    const { namespace } = builder._deployers.wsk._cfg;
    assert.ok(out.indexOf('ok: 200') > 0, out);
    assert.ok(out.indexOf(`{"url":"https://adobeioruntime.net/api/v1/web/${namespace}/simple-package/simple-name@1.45.0/foo?testPackageParam=42&test-package-param=42","file":"Hello, world.\\n"}`) > 0, out);

    const { fetch } = h1NoCache();
    const results = await Promise.all(['random', 'openwhisk', 'amazonwebservices'].map(async (name) => {
      const headers = {};
      if (name !== 'random') {
        headers['x-ow-version-lock'] = `env=${name}`;
      }
      const resp = await fetch('https://deploy-test.anywhere.run/simple-package/simple-name@1.45.0/foo', {
        headers,
      });
      let body = await resp.text();
      try {
        body = JSON.parse(body);
        if (name === 'random') {
          delete body.url;
        }
      } catch {
        // ignore
      }
      return {
        name,
        status: resp.status,
        body,
        backendName: name === 'random' ? name : (resp.headers.get('X-Backend-Name') || '').split('--').pop(),
        surrogate: resp.headers.get('Surrogate-Key'),
      };
    }));

    assert.deepStrictEqual(results, [{
      backendName: 'random',
      body: {
        file: 'Hello, world.\n',
      },
      name: 'random',
      status: 200,
      surrogate: 'simple',
    },
    {
      backendName: 'F_Openwhisk',
      body: {
        file: 'Hello, world.\n',
        url: 'https://adobeioruntime.net/api/v1/web/helix/simple-package/simple-name@1.45.0/foo?testPackageParam=42&test-package-param=42',
      },
      name: 'openwhisk',
      status: 200,
      surrogate: 'simple',
    },
    {
      backendName: 'F_AmazonWebServices',
      body: {
        file: 'Hello, world.\n',
        url: 'https://lqmig3v5eb.execute-api.us-east-1.amazonaws.com/simple-package/simple-name/1.45.0/foo',
      },
      name: 'amazonwebservices',
      status: 200,
      surrogate: 'simple',
    },
    ]);
  }).timeout(250000);
});

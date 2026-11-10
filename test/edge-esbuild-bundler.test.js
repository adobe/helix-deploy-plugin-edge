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
import http from 'http';
import EdgeESBuildBundler from '../src/EdgeESBuildBundler.js';

describe('EdgeESBuildBundler Tests', () => {
  it('detects available commands', () => {
    const bundler = new EdgeESBuildBundler({});
    assert.strictEqual(bundler.isCommandAvailable('node'), true);
    assert.strictEqual(bundler.isCommandAvailable('no-such-command-xyz'), false);
  });

  it('waits for a server to become ready', async () => {
    const server = http.createServer((req, res) => res.end('ok'));
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const bundler = new EdgeESBuildBundler({});
      const { port } = server.address();
      assert.strictEqual(await bundler.waitForServer(`http://127.0.0.1:${port}/`, 2000, 50), true);
    } finally {
      server.close();
    }
  });

  it('gives up waiting for a server that never starts', async () => {
    const bundler = new EdgeESBuildBundler({});
    assert.strictEqual(await bundler.waitForServer('http://127.0.0.1:1/', 200, 50), false);
  });

  it('skips validation without local runtimes', async () => {
    const messages = [];
    const bundler = new EdgeESBuildBundler({
      cwd: process.cwd(),
      edgeBundle: 'dist/bundle.js',
      log: { info: (m) => messages.push(m), warn: (m) => messages.push(m) },
    });
    bundler.isCommandAvailable = () => false;
    assert.deepStrictEqual(await bundler.validateBundle(), {});
    assert.ok(messages.some((m) => m.includes('skipping bundle validation')));
  });

  it('resolves dependency infos from the metafile', async () => {
    const bundler = new EdgeESBuildBundler({ cwd: process.cwd(), dependencies: {} });
    await bundler.resolveDependencyInfos({
      inputs: {
        'src/index.js': {},
        'node_modules/chalk-template/index.js': {},
        'node_modules/@adobe/fetch/src/index.js': {},
        'node_modules/no-such-package-xyz/index.js': {},
      },
    });
    assert.deepStrictEqual(bundler.cfg.dependencies.main.map((d) => d.name), ['@adobe/fetch', 'chalk-template']);
  });
});

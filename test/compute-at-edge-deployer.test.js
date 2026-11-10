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

import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ComputeAtEdgeDeployer from '../src/ComputeAtEdgeDeployer.js';

describe('Compute@Edge Deployer Tests', function bundleTests() {
  this.timeout(120000);

  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cae-bundle-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('bundles a module into a wasm package', async () => {
    const edgeBundle = path.join(dir, 'index.js');
    await fs.writeFile(edgeBundle, 'addEventListener("fetch", (e) => e.respondWith(new Response("ok")));\n');
    await fs.mkdir(path.join(dir, 'bin'));

    const deployer = new ComputeAtEdgeDeployer({
      edgeBundle,
      packageName: 'test',
      log: { debug: () => {} },
    }, { service: 'svc', auth: 'token' });

    const buf = await deployer.bundle();
    assert.ok(buf.length > 0);
    const wasm = await fs.stat(path.join(dir, 'bin', 'main.wasm'));
    assert.ok(wasm.size > 0);
    await fs.stat(path.join(dir, 'fastly.toml'));
  });
});

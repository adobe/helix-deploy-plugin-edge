/*
 * Copyright 2024 Adobe. All rights reserved.
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
/* eslint-disable no-underscore-dangle, no-await-in-loop, no-console */
import assert from 'assert';
import path from 'path';
import { spawn } from 'child_process';
import yauzl from 'yauzl';
import fse from 'fs-extra';
import { CLI } from '@adobe/helix-deploy';
import { createTestRoot } from './utils.js';

const PROJECT_PURE = path.resolve(__rootdir, 'test', 'fixtures', 'pure-action');
const PROJECT_ESBUILD = path.resolve(__rootdir, 'test', 'fixtures', 'esbuild-action');

/**
 * Extract zip file to directory
 */
async function extractZip(zipPath, destDir) {
  await fse.ensureDir(destDir);
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }
      zipfile.readEntry();
      zipfile
        .on('end', resolve)
        .on('error', reject)
        .on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
          } else {
            zipfile.openReadStream(entry, (er, readStream) => {
              if (er) {
                reject(er);
                return;
              }
              const p = path.resolve(destDir, entry.fileName);
              fse.ensureFileSync(p);
              readStream.pipe(fse.createWriteStream(p));
              readStream.on('end', () => {
                zipfile.readEntry();
              });
            });
          }
        });
    });
  });
}

/**
 * Wait for server to be ready by polling
 */
async function waitForServer(url, maxAttempts = 30, interval = 500) {
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => {
      setTimeout(r, interval);
    });
  }
  throw new Error(`Server at ${url} did not become ready`);
}

/**
 * Spawn a process and return handle with output capture
 */
function spawnProcess(cmd, args, options = {}) {
  const proc = spawn(cmd, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });

  const output = { stdout: '', stderr: '' };

  proc.stdout.on('data', (data) => {
    output.stdout += data.toString();
  });

  proc.stderr.on('data', (data) => {
    output.stderr += data.toString();
  });

  return { proc, output };
}

describe('Edge ESBuild Bundler Test', () => {
  let testRoot;
  let origPwd;

  beforeEach(async () => {
    testRoot = await createTestRoot();
    await fse.copy(PROJECT_PURE, testRoot);
    origPwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(origPwd);
    await fse.remove(testRoot);
  });

  it('generates the edge bundle with esbuild', async () => {
    process.chdir(testRoot);
    process.env.WSK_AUTH = 'foobar';
    process.env.WSK_NAMESPACE = 'foobar';
    process.env.WSK_APIHOST = 'https://example.com';
    process.env.__OW_ACTION_NAME = '/namespace/package/name@version';

    const builder = await new CLI()
      .prepare([
        '--target', 'wsk',
        '--plugin', path.resolve(__rootdir, 'src', 'index.js'),
        '--bundler', 'esbuild',
        '--esm', 'false',
        '--arch', 'edge',
        '--verbose',
        '--directory', testRoot,
        '--entryFile', 'src/index.js',
      ]);

    await builder.run();

    const zipPath = path.resolve(testRoot, 'dist', 'default', 'simple-project.zip');
    assert.ok(await fse.pathExists(zipPath), 'Zip file should exist');

    // Extract and verify contents
    const extractDir = path.resolve(testRoot, 'dist', 'extracted');
    await extractZip(zipPath, extractDir);

    const indexJs = path.resolve(extractDir, 'index.js');
    assert.ok(await fse.pathExists(indexJs), 'index.js should exist in bundle');

    const content = await fse.readFile(indexJs, 'utf-8');
    assert.ok(content.includes('Helix Edge Bundle - ESBuild'), 'Bundle should have esbuild banner');
  }).timeout(60000);
});

describe('Edge ESBuild Local Runtime Integration Tests', () => {
  let testRoot;
  let origPwd;

  beforeEach(async () => {
    testRoot = await createTestRoot();
    await fse.copy(PROJECT_ESBUILD, testRoot);
    origPwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(origPwd);
    await fse.remove(testRoot);
  });

  it('Integration: runs in Cloudflare Wrangler local dev', async function test() {
    this.timeout(120000);
    process.chdir(testRoot);
    process.env.WSK_AUTH = 'foobar';
    process.env.WSK_NAMESPACE = 'foobar';
    process.env.WSK_APIHOST = 'https://example.com';

    // Build with esbuild
    const builder = await new CLI()
      .prepare([
        '--target', 'wsk',
        '--plugin', path.resolve(__rootdir, 'src', 'index.js'),
        '--bundler', 'esbuild',
        '--esm', 'false',
        '--arch', 'edge',
        '--directory', testRoot,
        '--entryFile', 'src/index.js',
      ]);

    await builder.run();

    // Extract bundle (name comes from wsk.name in package.json)
    const zipPath = path.resolve(testRoot, 'dist', 'default', 'esbuild-test.zip');
    const extractDir = path.resolve(testRoot, 'dist', 'extracted');
    await extractZip(zipPath, extractDir);

    // Create wrangler config - use no_bundle since we already bundled
    const wranglerConfig = `
name = "test-worker"
main = "index.js"
compatibility_date = "2024-01-01"
no_bundle = true
`;
    await fse.writeFile(path.resolve(extractDir, 'wrangler.toml'), wranglerConfig);

    // Start wrangler
    const port = 8787 + Math.floor(Math.random() * 1000);
    const { proc } = spawnProcess('npx', ['wrangler', 'dev', '--port', String(port), '--local'], {
      cwd: extractDir,
      env: { ...process.env, CLOUDFLARE_WORKERS_TELEMETRY_OPT_OUT: '1' },
    });

    try {
      // Wait for server
      await waitForServer(`http://127.0.0.1:${port}/`);

      // Test the worker
      const response = await fetch(`http://127.0.0.1:${port}/`);
      assert.strictEqual(response.status, 200, 'Worker should return 200');

      const text = await response.text();
      assert.ok(text.includes('cloudflare'), 'Worker should detect Cloudflare platform');
    } finally {
      proc.kill('SIGTERM');
      // Give it time to shut down
      await new Promise((r) => {
        setTimeout(r, 1000);
      });
    }
  });

  it('Integration: compiles and runs in Fastly Viceroy local dev', async function test() {
    this.timeout(180000);
    process.chdir(testRoot);
    process.env.WSK_AUTH = 'foobar';
    process.env.WSK_NAMESPACE = 'foobar';
    process.env.WSK_APIHOST = 'https://example.com';

    // Build with esbuild
    const builder = await new CLI()
      .prepare([
        '--target', 'wsk',
        '--plugin', path.resolve(__rootdir, 'src', 'index.js'),
        '--bundler', 'esbuild',
        '--esm', 'false',
        '--arch', 'edge',
        '--directory', testRoot,
        '--entryFile', 'src/index.js',
      ]);

    await builder.run();

    // Extract bundle (name comes from wsk.name in package.json)
    const zipPath = path.resolve(testRoot, 'dist', 'default', 'esbuild-test.zip');
    const extractDir = path.resolve(testRoot, 'dist', 'extracted');
    await extractZip(zipPath, extractDir);

    // Create fastly.toml
    const fastlyConfig = `
manifest_version = 3
name = "test-compute"
[local_server]
[local_server.backends]
`;
    await fse.writeFile(path.resolve(extractDir, 'fastly.toml'), fastlyConfig);
    await fse.ensureDir(path.resolve(extractDir, 'bin'));

    // Compile to WASM using js-compute
    const jsComputePath = path.resolve(__rootdir, 'node_modules', '.bin', 'js-compute');
    const indexPath = path.resolve(extractDir, 'index.js');
    const wasmPath = path.resolve(extractDir, 'bin', 'main.wasm');

    await new Promise((resolve, reject) => {
      const jsCompute = spawn(jsComputePath, [indexPath, wasmPath], {
        cwd: extractDir,
        stdio: 'pipe',
      });

      let stderr = '';
      jsCompute.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      jsCompute.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`js-compute failed with code ${code}: ${stderr}`));
        }
      });
    });

    assert.ok(await fse.pathExists(wasmPath), 'WASM file should be created');

    // Check if fastly CLI is available
    try {
      await new Promise((resolve, reject) => {
        const which = spawn('which', ['fastly']);
        which.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error('fastly CLI not found'));
          }
        });
      });
    } catch {
      console.log('Skipping Viceroy test - fastly CLI not installed');
      return;
    }

    // Start Viceroy
    const port = 7676 + Math.floor(Math.random() * 1000);
    const { proc } = spawnProcess('fastly', ['compute', 'serve', '--skip-build', '--addr', `127.0.0.1:${port}`], {
      cwd: extractDir,
    });

    try {
      // Wait for server
      await waitForServer(`http://127.0.0.1:${port}/`);

      // Test the worker
      const response = await fetch(`http://127.0.0.1:${port}/`);
      assert.strictEqual(response.status, 200, 'Worker should return 200');

      const text = await response.text();
      assert.ok(text.includes('compute-at-edge') || text.includes('fastly'), 'Worker should detect Fastly platform');
    } finally {
      proc.kill('SIGTERM');
      await new Promise((r) => {
        setTimeout(r, 1000);
      });
    }
  });
});

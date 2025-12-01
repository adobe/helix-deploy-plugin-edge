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
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import path from 'path';
import fse from 'fs-extra';
import * as esbuild from 'esbuild';
import chalk from 'chalk-template';
import { BaseBundler } from '@adobe/helix-deploy';

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.resolve(fileURLToPath(import.meta.url), '..');

/**
 * Creates the action bundle using ESBuild for edge compute platforms
 * (Cloudflare Workers, Fastly Compute@Edge)
 */
export default class EdgeESBuildBundler extends BaseBundler {
  constructor(cfg) {
    super(cfg);
    this.arch = 'edge';
    this.type = 'esbuild';
  }

  /**
   * Creates the esbuild plugin for handling edge-specific module resolution
   */
  createEdgePlugin() {
    const { cfg } = this;

    return {
      name: 'helix-edge',
      setup(build) {
        // Handle fastly:* modules as external (they're provided by the runtime)
        build.onResolve({ filter: /^fastly:/ }, (args) => ({
          path: args.path,
          external: true,
        }));

        // Alias ./main.js to the user's entry point
        build.onResolve({ filter: /^\.\/main\.js$/ }, () => ({
          path: cfg.file,
        }));

        // Alias @adobe/fetch and @adobe/helix-fetch to the polyfill
        const fetchPolyfill = path.resolve(__dirname, 'template', 'polyfills', 'fetch.js');
        build.onResolve({ filter: /^@adobe\/(helix-)?fetch$/ }, () => ({
          path: fetchPolyfill,
        }));

        // Handle user-defined externals (filter to strings only)
        const allExternals = [
          ...(cfg.externals || []),
          ...(cfg.edgeExternals || []),
          './params.json',
          'aws-sdk',
          '@google-cloud/secret-manager',
          '@google-cloud/storage',
        ].filter((ext) => typeof ext === 'string');

        allExternals.forEach((external) => {
          const pattern = external.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          build.onResolve({ filter: new RegExp(`^${pattern}$`) }, (args) => ({
            path: args.path,
            external: true,
          }));
        });
      },
    };
  }

  async getESBuildConfig() {
    const { cfg } = this;

    /** @type {esbuild.BuildOptions} */
    const opts = {
      // Entry point - the universal edge adapter
      entryPoints: [cfg.adapterFile || path.resolve(__dirname, 'template', 'edge-index.js')],

      // Output configuration
      outfile: path.relative(cfg.cwd, cfg.edgeBundle),
      bundle: true,
      write: true,

      // Platform settings for edge compute (Service Worker-like environment)
      platform: 'browser',
      target: 'es2022',
      format: 'esm',

      // Working directory
      absWorkingDir: cfg.cwd,

      // Don't minify by default for easier debugging
      minify: false,

      // Tree shaking
      treeShaking: true,

      // Generate metafile for dependency analysis
      metafile: true,

      // Plugins for edge-specific handling
      plugins: [this.createEdgePlugin()],

      // Conditions for package.json exports field
      conditions: ['worker', 'browser'],

      // Define globals
      define: {
        'process.env.NODE_ENV': '"production"',
      },

      // Banner for identification
      banner: {
        js: '/* Helix Edge Bundle - ESBuild */',
      },
    };

    // Apply minification if requested
    if (cfg.minify) {
      opts.minify = cfg.minify;
    }

    // Progress handler (esbuild doesn't have built-in progress, but we can log)
    if (cfg.progressHandler) {
      // esbuild is fast enough that progress isn't really needed
      // but we can notify at start/end
      cfg.progressHandler(0, 'Starting esbuild bundle...');
    }

    return opts;
  }

  async createBundle() {
    const { cfg } = this;
    if (!cfg.edgeBundle) {
      throw Error('edge bundle path is undefined');
    }
    if (!cfg.depFile) {
      throw Error('dependencies info path is undefined');
    }

    const m = cfg.minify ? 'minified ' : '';
    if (!cfg.progressHandler) {
      cfg.log.info(`--: creating edge ${m}bundle using esbuild ...`);
    }

    const config = await this.getESBuildConfig();

    // Ensure output directory exists
    await fse.ensureDir(path.dirname(path.resolve(cfg.cwd, cfg.edgeBundle)));

    const result = await esbuild.build(config);

    // Process metafile for dependency info
    await this.resolveDependencyInfos(result.metafile);

    // Write dependencies info file
    await fse.writeJson(cfg.depFile, cfg.dependencies, { spaces: 2 });

    if (!cfg.progressHandler) {
      cfg.log.info(chalk`{green ok:} created edge bundle {yellow ${config.outfile}}`);
    }

    return result;
  }

  /**
   * Resolves dependency information from esbuild metafile
   */
  async resolveDependencyInfos(metafile) {
    const { cfg } = this;

    const resolved = {};
    const deps = {};

    const depNames = Object.keys(metafile.inputs);

    await Promise.all(depNames.map(async (depName) => {
      const absDepPath = path.resolve(cfg.cwd, depName);
      const segs = absDepPath.split('/');
      let idx = segs.lastIndexOf('node_modules');
      if (idx < 0) {
        return;
      }
      idx += 1;
      if (segs[idx].charAt(0) === '@') {
        idx += 1;
      }
      segs.splice(idx + 1);
      const dir = path.resolve('/', ...segs);

      try {
        if (!resolved[dir]) {
          const pkgJson = await fse.readJson(path.resolve(dir, 'package.json'));
          const id = `${pkgJson.name}:${pkgJson.version}`;
          resolved[dir] = {
            id,
            name: pkgJson.name,
            version: pkgJson.version,
          };
        }
        const dep = resolved[dir];
        deps[dep.id] = dep;
      } catch {
        // ignore - not a package
      }
    }));

    // Sort and store dependencies
    cfg.dependencies.main = Object.values(deps)
      .sort((d0, d1) => d0.name.localeCompare(d1.name));
  }

  async updateArchive(archive, packageJson) {
    await super.updateArchive(archive, packageJson);
    archive.file(this.cfg.edgeBundle, { name: 'index.js' });

    // Add wrangler.toml for Cloudflare compatibility
    archive.append([
      'account_id = "fakefakefake"',
      `name = "${this.cfg.packageName}/${this.cfg.name}"`,
      'type = "javascript"',
      'workers_dev = true',
    ].join('\n'), { name: 'wrangler.toml' });
  }

  /**
   * Checks if a command is available in the system PATH
   * @param {string} command - The command to check
   * @returns {boolean} - True if the command is available
   */
  // eslint-disable-next-line class-methods-use-this
  isCommandAvailable(command) {
    try {
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Waits for a server to become ready by polling an HTTP endpoint.
   * @param {string} url - The URL to poll
   * @param {number} timeout - Maximum time to wait in ms
   * @param {number} interval - Polling interval in ms
   * @returns {Promise<boolean>} True if server is ready, false if timeout
   */
  // eslint-disable-next-line class-methods-use-this
  async waitForServer(url, timeout = 10000, interval = 500) {
    const start = Date.now();
    // eslint-disable-next-line no-await-in-loop
    while (Date.now() - start < timeout) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const response = await fetch(url);
        if (response.ok || response.status < 500) {
          return true;
        }
      } catch {
        // Server not ready yet, continue polling
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, interval);
      });
    }
    return false;
  }

  /**
   * Validates the edge bundle using wrangler (Cloudflare) or viceroy (Fastly) if available.
   * Starts a local server, makes an HTTP request to validate, then stops the server.
   * @returns {Promise<{wrangler?: boolean, fastly?: boolean}>} Validation results
   */
  async validateBundle() {
    const { cfg } = this;
    const bundlePath = cfg.edgeBundle;
    const bundleDir = path.dirname(path.resolve(cfg.cwd, bundlePath));
    const results = {};

    // Try wrangler validation (Cloudflare)
    const hasWrangler = this.isCommandAvailable('wrangler');
    if (hasWrangler) {
      cfg.log.info('--: validating edge bundle with wrangler...');
      let wranglerProcess = null;
      const wranglerPort = 8787 + Math.floor(Math.random() * 1000);
      try {
        // Create a minimal wrangler.toml for validation
        const wranglerToml = path.join(bundleDir, 'wrangler.toml');
        const wranglerConfig = [
          'name = "validation-test"',
          `main = "${path.basename(bundlePath)}"`,
          'compatibility_date = "2024-01-01"',
          'no_bundle = true',
        ].join('\n');
        await fse.writeFile(wranglerToml, wranglerConfig);

        // Start wrangler dev server
        wranglerProcess = spawn('wrangler', ['dev', '--local', '--port', String(wranglerPort)], {
          cwd: bundleDir,
          stdio: 'pipe',
        });

        // Wait for server to be ready
        const serverReady = await this.waitForServer(`http://127.0.0.1:${wranglerPort}/`);

        if (serverReady) {
          // Make a validation request
          const response = await fetch(`http://127.0.0.1:${wranglerPort}/`);
          if (response.ok || response.status < 500) {
            cfg.log.info(chalk`{green ok:} wrangler validation passed (status: ${response.status})`);
            results.wrangler = true;
          } else {
            cfg.log.warn(chalk`{yellow warn:} wrangler validation returned status ${response.status}`);
            results.wrangler = false;
          }
        } else {
          cfg.log.warn(chalk`{yellow warn:} wrangler server failed to start within timeout`);
          results.wrangler = false;
        }
      } catch (err) {
        cfg.log.warn(chalk`{yellow warn:} wrangler validation failed: ${err.message}`);
        results.wrangler = false;
      } finally {
        // Kill wrangler process
        if (wranglerProcess) {
          wranglerProcess.kill('SIGTERM');
        }
        // Clean up temporary wrangler.toml
        const wranglerToml = path.join(bundleDir, 'wrangler.toml');
        await fse.remove(wranglerToml).catch(() => {});
      }
    }

    // Try Fastly validation (via fastly CLI which uses viceroy)
    const hasFastly = this.isCommandAvailable('fastly');
    if (hasFastly) {
      cfg.log.info('--: validating edge bundle with fastly (viceroy)...');
      let fastlyProcess = null;
      const fastlyPort = 7676 + Math.floor(Math.random() * 1000);
      try {
        // Create a minimal fastly.toml for validation
        const fastlyToml = path.join(bundleDir, 'fastly.toml');
        const fastlyConfig = [
          'manifest_version = 3',
          'name = "validation-test"',
          'language = "javascript"',
          'service_id = ""',
          '',
          '[scripts]',
          'build = ""',
        ].join('\n');
        await fse.writeFile(fastlyToml, fastlyConfig);

        // Start fastly compute serve
        fastlyProcess = spawn('fastly', [
          'compute', 'serve',
          '--skip-build',
          '--file', path.basename(bundlePath),
          '--addr', `127.0.0.1:${fastlyPort}`,
        ], {
          cwd: bundleDir,
          stdio: 'pipe',
        });

        // Wait for server to be ready
        const serverReady = await this.waitForServer(`http://127.0.0.1:${fastlyPort}/`);

        if (serverReady) {
          // Make a validation request
          const response = await fetch(`http://127.0.0.1:${fastlyPort}/`);
          if (response.ok || response.status < 500) {
            cfg.log.info(chalk`{green ok:} fastly validation passed (status: ${response.status})`);
            results.fastly = true;
          } else {
            cfg.log.warn(chalk`{yellow warn:} fastly validation returned status ${response.status}`);
            results.fastly = false;
          }
        } else {
          cfg.log.warn(chalk`{yellow warn:} fastly server failed to start within timeout`);
          results.fastly = false;
        }
      } catch (err) {
        cfg.log.warn(chalk`{yellow warn:} fastly validation failed: ${err.message}`);
        results.fastly = false;
      } finally {
        // Kill fastly process
        if (fastlyProcess) {
          fastlyProcess.kill('SIGTERM');
        }
        // Clean up temporary fastly.toml
        const fastlyToml = path.join(bundleDir, 'fastly.toml');
        await fse.remove(fastlyToml).catch(() => {});
      }
    }

    if (!hasWrangler && !hasFastly) {
      cfg.log.info('--: skipping bundle validation (neither wrangler nor fastly CLI installed)');
    }

    return results;
  }
}

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
import { fileURLToPath } from 'url';
import path from 'path';
import { WebpackBundler } from '@adobe/helix-deploy-plugin-webpack';

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.resolve(fileURLToPath(import.meta.url), '..');

/**
 * Creates the action bundle
 */
export default class EdgeBundler extends WebpackBundler {
  constructor(cfg) {
    super(cfg);
    this.arch = 'edge';
  }

  async getWebpackConfig() {
    const { cfg } = this;
    const opts = {
      target: 'webworker',
      mode: 'production',
      // the universal adapter is the entry point
      entry: cfg.adapterFile || path.resolve(__dirname, 'template', 'edge-index.js'),
      output: {
        path: cfg.cwd,
        filename: path.relative(cfg.cwd, cfg.edgeBundle),
        library: 'main',
        libraryTarget: 'umd',
        globalObject: 'globalThis',
      },
      devtool: false,
      externals: [
        ...cfg.externals, // user defined externals for all platforms
        ...cfg.edgeExternals, // user defined externals for edge compute
        // the following are imported by the universal adapter and are assumed to be available
        './params.json',
        'aws-sdk',
        '@google-cloud/secret-manager',
        '@google-cloud/storage',
        'fastly:env',
        'fastly:logger',
      ].reduce((obj, ext) => {
        // this makes webpack to ignore the module and just leave it as normal require.
        // eslint-disable-next-line no-param-reassign
        obj[ext] = `commonjs2 ${ext}`;
        return obj;
      }, {}),
      module: {
        rules: [{
          test: /\.js$/,
          type: 'javascript/auto',
        }, {
          test: /\.mjs$/,
          type: 'javascript/esm',
        }],
      },
      resolve: {
        mainFields: ['main', 'module'],
        extensions: ['.wasm', '.js', '.mjs', '.json'],
        alias: {
          // the main.js is imported in the universal adapter and is _the_ action entry point
          './main.js': cfg.file,
          // 'psl': path.resolve(__dirname, '../node_modules/psl/dist/psl.js'), // inlined data
          '@adobe/fetch': path.resolve(__dirname, 'template/polyfills/fetch.js'),
          '@adobe/helix-fetch': path.resolve(__dirname, 'template/polyfills/fetch.js'),
        },
        /*         fallback: {
          assert: require.resolve('assert'),
          buffer: require.resolve('buffer'),
          console: require.resolve('console-browserify'),
          constants: require.resolve('constants-browserify'),
          crypto: require.resolve('crypto-browserify'),
          domain: require.resolve('domain-browser'),
          events: path.resolve(__dirname, '../node_modules/events/events.js'),
          http: require.resolve('stream-http'),
          https: require.resolve('https-browserify'),
          os: require.resolve('os-browserify/browser'),
          path: require.resolve('path-browserify'),
          punycode: require.resolve('punycode'),
          process: require.resolve('process/browser'),
          querystring: require.resolve('querystring-es3'),
          stream: require.resolve('stream-browserify'),
          string_decoder: require.resolve('string_decoder'),
          sys: require.resolve('util'),
          timers: require.resolve('timers-browserify'),
          tty: require.resolve('tty-browserify'),
          url: require.resolve('url'),
          util: require.resolve('util'),
          vm: require.resolve('vm-browserify'),
          zlib: require.resolve('browserify-zlib'),
        }, */
      },
      node: {
        __dirname: true,
        __filename: false,
      },
      optimization: {
        // we enable production mode in order to get the correct imports (eg micromark has special
        // export condition for 'development'). but we disable minimize and keep named modules
        // in order to easier match log errors to the bundle
        minimize: false,
        concatenateModules: false,
        mangleExports: false,
        moduleIds: 'named',
      },
      plugins: [],
    };
    if (cfg.minify) {
      opts.optimization = {
        minimize: cfg.minify,
      };
    }
    if (cfg.modulePaths && cfg.modulePaths.length > 0) {
      opts.resolve.modules = cfg.modulePaths;
    }

    if (cfg.progressHandler) {
      this.initProgressHandler(opts, cfg);
    }
    return opts;
  }

  async createBundle() {
    const { cfg } = this;
    if (!cfg.edgeBundle) {
      throw Error('edge bundle path is undefined');
    }
    return this.createWebpackBundle('edge');
  }

  async updateArchive(archive, packageJson) {
    await super.updateArchive(archive, packageJson);
    archive.file(this.cfg.edgeBundle, { name: 'index.js' });

    // edge function stuff
    archive.append([
      'account_id = "fakefakefake"',
      `name = "${this.cfg.packageName}/${this.cfg.name}"`,
      'type = "javascript"',
      'workers_dev = true',
    ].join('\n'), { name: 'wrangler.toml' });
  }

  // eslint-disable-next-line class-methods-use-this
  validateBundle() {
    // TODO: validate edge bundle, skipped since we're on node
  }
}

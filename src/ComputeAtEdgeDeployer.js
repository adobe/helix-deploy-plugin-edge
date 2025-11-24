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
import chalk from 'chalk-template';
import path from 'path';
import fs from 'fs/promises';
import * as tar from 'tar';
import Fastly from '@adobe/fastly-native-promises';
import { compileApplicationToWasm } from '@fastly/js-compute/src/compileApplicationToWasm.js';
import { parseInputs } from '@fastly/js-compute/src/parseInputs.js';
import { BaseDeployer } from '@adobe/helix-deploy';
import ComputeAtEdgeConfig from './ComputeAtEdgeConfig.js';

/**
 * The class ComputeAtEdgeDeployer deploys to Fastly's Compute(at)Edge (WASM) runtime.
 * It should be seen as a functional equivalent to the CloudflareDeployer
 * and not confused with the FastlyGateway (which only routes requests, but
 * does not handle them.)
 */
export default class ComputeAtEdgeDeployer extends BaseDeployer {
  constructor(baseConfig, config) {
    super(baseConfig);
    Object.assign(this, {
      id: 'c@e',
      name: 'Fastly Compute@Edge',
      _cfg: config,
      _fastly: null,
      noGatewayBackend: true,
    });
  }

  ready() {
    return !!this._cfg.service && !!this._cfg.auth && !!this.cfg.edgeBundle;
  }

  validate() {
    if (!this.ready()) {
      throw new Error('Compute@Edge target needs token and service ID');
    }
  }

  init() {
    if (this.ready() && !this._fastly) {
      this._fastly = Fastly(this._cfg.auth, this._cfg.service, 60000);
    }
  }

  get log() {
    return this.cfg.log;
  }

  /**
   * Get or create a secret store via Fastly API
   * @param {string} name - Name of the secret store
   * @returns {Promise<string>} - Store ID
   */
  async getOrCreateSecretStore(name) {
    // Try to list stores and find by name
    try {
      const listRes = await this.fetch(`https://api.fastly.com/resources/stores/secret`, {
        method: 'GET',
        headers: {
          'Fastly-Key': this._cfg.auth,
          Accept: 'application/json',
        },
      });
      const stores = await listRes.json();
      const existing = stores.data?.find((s) => s.name === name);
      if (existing) {
        return existing.id;
      }
    } catch (err) {
      this.log.debug(`Could not list secret stores: ${err.message}`);
    }

    // Create new store
    const res = await this.fetch(`https://api.fastly.com/resources/stores/secret`, {
      method: 'POST',
      headers: {
        'Fastly-Key': this._cfg.auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    return data.id || data.store_id;
  }

  /**
   * Get or create a config store via Fastly API
   * @param {string} name - Name of the config store
   * @returns {Promise<string>} - Store ID
   */
  async getOrCreateConfigStore(name) {
    // Try to list stores and find by name
    try {
      const listRes = await this.fetch(`https://api.fastly.com/resources/stores/config`, {
        method: 'GET',
        headers: {
          'Fastly-Key': this._cfg.auth,
          Accept: 'application/json',
        },
      });
      const stores = await listRes.json();
      const existing = stores.data?.find((s) => s.name === name);
      if (existing) {
        return existing.id;
      }
    } catch (err) {
      this.log.debug(`Could not list config stores: ${err.message}`);
    }

    // Create new store
    const res = await this.fetch(`https://api.fastly.com/resources/stores/config`, {
      method: 'POST',
      headers: {
        'Fastly-Key': this._cfg.auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    return data.id || data.store_id;
  }

  /**
   * Link a resource (secret/config store) to a service version
   * @param {string} version - Service version
   * @param {string} resourceId - Resource store ID
   * @param {string} name - Name to use in the service
   * @returns {Promise<void>}
   */
  async linkResource(version, resourceId, name) {
    await this._fastly.request(`/service/${this._cfg.service}/version/${version}/resource`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        resource_id: resourceId,
      }),
    });
  }

  /**
   * Add or update a secret in a secret store
   * @param {string} storeId - Secret store ID
   * @param {string} name - Secret name
   * @param {string} value - Secret value
   * @returns {Promise<void>}
   */
  async putSecret(storeId, name, value) {
    await this.fetch(`https://api.fastly.com/resources/stores/secret/${storeId}/secrets`, {
      method: 'PUT',
      headers: {
        'Fastly-Key': this._cfg.auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ name, secret: value }),
    });
  }

  /**
   * Add or update an item in a config store
   * @param {string} storeId - Config store ID
   * @param {string} key - Item key
   * @param {string} value - Item value
   * @returns {Promise<void>}
   */
  async putConfigItem(storeId, key, value) {
    await this.fetch(`https://api.fastly.com/resources/stores/config/${storeId}/item/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: {
        'Fastly-Key': this._cfg.auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ item_key: key, item_value: value }),
    });
  }

  /**
   *
   * @returns
   */
  async bundle() {
    const bundleDir = path.dirname(this.cfg.edgeBundle);
    this.log.debug(`--: creating fastly.toml in ${bundleDir}`);
    fs.writeFile(path.resolve(bundleDir, 'fastly.toml'), `
# This file describes a Fastly Compute@Edge package. To learn more visit:
# https://developer.fastly.com/reference/fastly-toml/

authors = ["Helix Deploy"]
description = "${this.cfg.packageName} project generated by Helix Deploy"
language = "javascript"
manifest_version = 2
name = "${this.cfg.packageName}"
service_id = ""
    `);

    const {
      input,
      output,
      wasmEngine,
    } = await parseInputs([this.cfg.edgeBundle, path.resolve(bundleDir, 'bin', 'main.wasm')]);

    return new Promise((resolve, reject) => {
      this.log.debug('--: creating WASM bundle of script and interpreter');
      compileApplicationToWasm(
        input, // input file
        output, // output file
        wasmEngine, // wasm engine
        true, // enableHttpCache
        false, // enableExperimentalHighResolutionTimeMethods
        true, // enableAOT
        '', // aotCache
        true, // moduleMode
        true, // doBundle
      )
        .then(async () => {
          const file = path.resolve(bundleDir, 'fastly-bundle.tar.gz');
          this.log.debug(chalk`{green ok:} created WASM bundle of script and interpreter in ${bundleDir}/bin/main.wasm`);
          await tar.c({
            gzip: true,
            // sync: true,
            cwd: bundleDir,
            prefix: this.cfg.packageName,
            file,
          }, ['bin/main.wasm', 'fastly.toml']);
          this.log.debug(chalk`{green ok:} created tar file in ${bundleDir}/fastly-bundle.tar.gz`);
          resolve(fs.readFile(file));
        })
        // c8 ignore next 3
        .catch((err) => {
          reject(err);
        });
    });
  }

  async deploy() {
    const buf = await this.bundle();
    this.init();

    await this._fastly.transact(async (version) => {
      this.log.debug('--: uploading package to fastly, service version', version);
      await this._fastly.writePackage(version, buf);

      // Get or create secret store for action params and special params
      const secretStoreName = `${this.cfg.packageName}--secrets`;
      this.log.debug(`--: getting or creating secret store: ${secretStoreName}`);
      const secretStoreId = await this.getOrCreateSecretStore(secretStoreName);
      await this.linkResource(version, secretStoreId, 'secrets');

      // Get or create config store for package params
      const configStoreName = `${this.cfg.packageName}--config`;
      this.log.debug(`--: getting or creating config store: ${configStoreName}`);
      const configStoreId = await this.getOrCreateConfigStore(configStoreName);
      await this.linkResource(version, configStoreId, 'config');

      // Populate secret store with action params
      this.log.debug('--: populating secret store with action params');
      for (const [key, value] of Object.entries(this.cfg.params)) {
        await this.putSecret(secretStoreId, key, value);
      }

      // Populate secret store with special params for gateway fallback
      if (this.cfg.packageToken) {
        await this.putSecret(secretStoreId, '_token', this.cfg.packageToken);
      }
      if (this._cfg.fastlyGateway) {
        await this.putSecret(secretStoreId, '_package', `https://${this._cfg.fastlyGateway}/${this.cfg.packageName}/`);
      }

      // Populate config store with package params
      this.log.debug('--: populating config store with package params');
      for (const [key, value] of Object.entries(this.cfg.packageParams)) {
        await this.putConfigItem(configStoreId, key, value);
      }

      const host = this._cfg.fastlyGateway;
      const backend = {
        hostname: host,
        ssl_cert_hostname: host,
        ssl_sni_hostname: host,
        address: host,
        override_host: host,
        name: 'gateway',
        error_threshold: 0,
        first_byte_timeout: 60000,
        weight: 100,
        connect_timeout: 5000,
        port: 443,
        between_bytes_timeout: 10000,
        shield: '', // 'bwi-va-us',
        max_conn: 200,
        use_ssl: true,
      };
      if (host) {
        this.log.debug(`--: updating gateway backend: ${host}`);
        await this._fastly.writeBackend(version, 'gateway', backend);
      }
    }, true);

    this.log.debug('--: waiting for 90 seconds for Fastly to process the deployment...');
    await new Promise((resolve) => {
      setTimeout(resolve, 90000);
    });
    this.log.debug('--: continuing after wait period');

    await this._fastly.discard();
  }

  async updatePackage() {
    this.log.info(`--: updating app (gateway) config for https://${this._cfg.fastlyGateway}/${this.cfg.packageName}/...`);

    this.init();

    // Get store IDs - stores should already exist from deployment
    const secretStoreName = `${this.cfg.packageName}--secrets`;
    const configStoreName = `${this.cfg.packageName}--config`;
    this.log.debug(`--: looking up store IDs for ${secretStoreName} and ${configStoreName}`);
    const secretStoreId = await this.getOrCreateSecretStore(secretStoreName);
    const configStoreId = await this.getOrCreateConfigStore(configStoreName);

    // Update secret store with action params
    this.log.debug('--: updating secret store with action params');
    for (const [key, value] of Object.entries(this.cfg.params)) {
      await this.putSecret(secretStoreId, key, value);
    }

    // Update special params for gateway fallback
    if (this.cfg.packageToken) {
      await this.putSecret(secretStoreId, '_token', this.cfg.packageToken);
    }
    if (this._cfg.fastlyGateway) {
      await this.putSecret(secretStoreId, '_package', `https://${this._cfg.fastlyGateway}/${this.cfg.packageName}/`);
    }

    // Update config store with package params
    this.log.debug('--: updating config store with package params');
    for (const [key, value] of Object.entries(this.cfg.packageParams)) {
      await this.putConfigItem(configStoreId, key, value);
    }

    await this._fastly.discard();
  }

  get fullFunctionName() {
    return `${this.cfg.packageName}--${this.cfg.name}`
      .replace(/\./g, '_')
      .replace('@', '_');
  }

  async test() {
    return this._cfg.testDomain
      ? this.testRequest({
        url: `https://${this._cfg.testDomain}.edgecompute.app`,
        retry404: 0,
      })
      : undefined;
  }
}

ComputeAtEdgeDeployer.Config = ComputeAtEdgeConfig;

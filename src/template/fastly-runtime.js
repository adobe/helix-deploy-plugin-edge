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

/**
 * Helper module for loading Fastly runtime modules.
 * This module can be mocked in tests to provide fake implementations.
 */

let envModule = null;
let secretStoreModule = null;
let loggerModule = null;
let backendModule = null;

/**
 * Get the Fastly environment module
 * @returns {Promise<{env: Function}>}
 */
export async function getFastlyEnv() {
  if (!envModule) {
    /* eslint-disable-next-line import/no-unresolved */
    envModule = await import(/* webpackIgnore: true */ 'fastly:env');
  }
  return envModule;
}

/**
 * Get the Fastly SecretStore class
 * @returns {Promise<Function|null>}
 */
export async function getSecretStore() {
  if (secretStoreModule) {
    return secretStoreModule.SecretStore;
  }
  try {
    /* eslint-disable-next-line import/no-unresolved */
    secretStoreModule = await import(/* webpackIgnore: true */ 'fastly:secret-store');
    return secretStoreModule.SecretStore;
  } catch {
    return null;
  }
}

/**
 * Get the Fastly Logger class
 * @returns {Promise<Function|null>}
 */
export async function getLogger() {
  if (loggerModule) {
    return loggerModule.Logger;
  }
  try {
    /* eslint-disable-next-line import/no-unresolved */
    loggerModule = await import(/* webpackIgnore: true */ 'fastly:logger');
    return loggerModule.Logger;
  } catch {
    return null;
  }
}

/**
 * Get the Fastly Backend class
 * @returns {Promise<Function|null>}
 */
export async function getBackendClass() {
  if (backendModule) {
    return backendModule.Backend;
  }
  try {
    /* eslint-disable-next-line import/no-unresolved */
    backendModule = await import(/* webpackIgnore: true */ 'fastly:backend');
    return backendModule.Backend;
  } catch {
    return null;
  }
}

// Cache for created dynamic backends to avoid recreating them
const dynamicBackends = new Map();
let dynamicBackendsEnabled = false;

/**
 * Enable dynamic backends for this request.
 * Must be called before creating dynamic backends.
 */
async function enableDynamicBackends() {
  if (dynamicBackendsEnabled) return;
  try {
    /* eslint-disable-next-line import/no-unresolved */
    const { allowDynamicBackends } = await import(/* webpackIgnore: true */ 'fastly:experimental');
    allowDynamicBackends(true);
    dynamicBackendsEnabled = true;
  } catch {
    // allowDynamicBackends not available, dynamic backends may not work
  }
}

/**
 * Get or create a backend for a given hostname.
 * First tries to use a named backend (from fastly.toml), then falls back to dynamic backend.
 * @param {string} hostname - The hostname to get/create a backend for
 * @returns {Promise<string|object|null>} - Backend name (string) for named backends,
 *   Backend object for dynamic backends, or null if not in Fastly environment
 */
export async function getBackend(hostname) {
  const Backend = await getBackendClass();
  if (!Backend) {
    return null;
  }

  // Check if a named backend exists (from fastly.toml)
  // For named backends, return the name as a string - Fastly fetch accepts either
  let exists = false;
  try {
    exists = Backend.exists(hostname);
    // eslint-disable-next-line no-console
    console.log(`Backend.exists('${hostname}') = ${exists}`);
  } catch (err) {
    // Backend.exists() may throw in some environments (e.g., older Viceroy)
    // eslint-disable-next-line no-console
    console.log(`Backend.exists('${hostname}') threw: ${err.message}`);
  }
  if (exists) {
    return hostname;
  }

  // Check if we already created a dynamic backend for this hostname
  if (dynamicBackends.has(hostname)) {
    return dynamicBackends.get(hostname);
  }

  // Enable dynamic backends before creating one
  await enableDynamicBackends();

  // Create a new dynamic backend
  // eslint-disable-next-line no-console
  console.log(`Creating dynamic backend for ${hostname}`);
  try {
    const backend = new Backend({
      name: hostname,
      target: hostname,
      hostOverride: hostname,
      useSSL: true,
      sniHostname: hostname,
    });
    dynamicBackends.set(hostname, backend);
    return backend;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Failed to create dynamic backend for ${hostname}: ${err.message}`);
    return null;
  }
}

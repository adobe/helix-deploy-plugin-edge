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

/**
 * Helper module for loading Fastly runtime modules.
 * This module can be mocked in tests to provide fake implementations.
 */

let envModule = null;
let secretStoreModule = null;
let loggerModule = null;

/**
 * Get the Fastly environment module
 * @returns {Promise<{env: Function}>}
 */
export async function getFastlyEnv() {
  if (!envModule) {
    /* eslint-disable-next-line import/no-unresolved */
    envModule = await import('fastly:env');
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
    secretStoreModule = await import('fastly:secret-store');
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
    loggerModule = await import('fastly:logger');
    return loggerModule.Logger;
  } catch {
    return null;
  }
}

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
/* eslint-env serviceworker */

/**
 * Detects if the code is running in a Cloudflare Workers environment.
 * @returns {boolean} true if running on Cloudflare
 */
function isCloudflareEnvironment() {
  try {
    // caches is a Cloudflare-specific global (CacheStorage API)
    return typeof caches !== 'undefined' && caches.default !== undefined;
  } catch {
    return false;
  }
}

/**
 * Wrapper for fetch that provides cross-platform decompression support.
 * Maps the @adobe/fetch `decompress` option to platform-specific behavior:
 * - Fastly: Sets fastly.decompressGzip based on decompress value
 * - Cloudflare: No-op (automatically decompresses)
 * - Node.js: Pass through to @adobe/fetch (handles it natively)
 *
 * @param {RequestInfo} resource - URL or Request object
 * @param {RequestInit & {decompress?: boolean, fastly?: object}} options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
function wrappedFetch(resource, options = {}) {
  // Extract decompress option (default: true to match @adobe/fetch behavior)
  const { decompress = true, fastly, ...otherOptions } = options;

  // On Cloudflare: pass through as-is (auto-decompresses)
  if (isCloudflareEnvironment()) {
    return fetch(resource, options);
  }

  // On Fastly/Node.js: map decompress to fastly.decompressGzip
  // This will be used on Fastly and ignored on Node.js
  const fastlyOptions = {
    decompressGzip: decompress,
    ...fastly, // explicit fastly options override
  };
  return fetch(resource, { ...otherOptions, fastly: fastlyOptions });
}

// Export wrapped fetch and native Web APIs
export { wrappedFetch as fetch };
export const { Request, Response, Headers } = globalThis;

// Export for CommonJS (for compatibility with require() in bundled code)
export default {
  fetch: wrappedFetch,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
};

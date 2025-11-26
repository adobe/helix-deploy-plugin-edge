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

// Platform detection and native CacheOverride loading
let nativeCacheOverride = null;
let isFastly = false;
let isCloudflare = false;
let fastlyModulePromise = null;

// Try to import Fastly's CacheOverride module
// Use a function to prevent webpack from trying to resolve this at build time
async function loadFastlyModule() {
  try {
    // Dynamic import - webpack will leave this as-is because it's external
    const moduleName = 'fastly:cache-override';
    // eslint-disable-next-line import/no-unresolved
    const module = await import(/* webpackIgnore: true */ moduleName);
    nativeCacheOverride = module.CacheOverride;
    isFastly = true;
    return module;
  } catch {
    // Not Fastly environment - this is expected on other platforms
    return null;
  }
}

// Start loading the module if available
try {
  fastlyModulePromise = loadFastlyModule();
} catch {
  fastlyModulePromise = null;
}

// Detect Cloudflare environment
try {
  if (typeof caches !== 'undefined' && caches.default) {
    isCloudflare = true;
  }
} catch {
  // Not Cloudflare
}

/**
 * Unified CacheOverride class that works across Fastly and Cloudflare platforms
 */
class UnifiedCacheOverride {
  /**
   * Creates a new CacheOverride instance
   * @param {string|object} modeOrInit - Either a mode string or init object
   * @param {object} [init] - Optional init object when mode is first param
   * @param {number} [init.ttl] - Time-to-live in seconds
   * @param {string} [init.cacheKey] - Custom cache key
   * @param {string} [init.surrogateKey] - Surrogate keys for cache purging
   */
  constructor(modeOrInit, init) {
    let mode;
    let options;

    // Parse constructor arguments (supports both signatures)
    if (typeof modeOrInit === 'string') {
      mode = modeOrInit;
      options = init || {};
    } else {
      mode = 'override';
      options = modeOrInit || {};
    }

    // Validate that only supported cross-platform options are used
    const supportedOptions = ['ttl', 'cacheKey', 'surrogateKey'];
    const unsupported = Object.keys(options)
      .filter((key) => !supportedOptions.includes(key));
    if (unsupported.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `CacheOverride: Unsupported options ignored: ${unsupported.join(', ')}`,
      );
    }

    this.mode = mode;
    this.options = {
      ...(typeof options.ttl === 'number' && { ttl: options.ttl }),
      ...(options.cacheKey && { cacheKey: options.cacheKey }),
      ...(options.surrogateKey && { surrogateKey: options.surrogateKey }),
    };

    this.modeOrInit = modeOrInit;
    this.native = null;
    this.nativeInitialized = false;
  }

  /**
   * Lazy initialization of native Fastly CacheOverride
   * @private
   */
  async initNative() {
    if (this.nativeInitialized) {
      return;
    }

    this.nativeInitialized = true;

    // Wait for Fastly module to load if needed
    if (fastlyModulePromise) {
      await fastlyModulePromise;
    }

    // Create native instance if on Fastly
    if (isFastly && nativeCacheOverride) {
      // eslint-disable-next-line new-cap
      const NativeCacheOverride = nativeCacheOverride;
      if (typeof this.modeOrInit === 'string') {
        this.native = new NativeCacheOverride(this.modeOrInit, this.options);
      } else {
        this.native = new NativeCacheOverride(this.options);
      }
    }
  }

  /**
   * Converts this CacheOverride to Cloudflare cf options
   * @returns {object|undefined} Cloudflare cf object or undefined
   */
  toCloudflareOptions() {
    const cf = {};

    if (this.mode === 'pass') {
      // Pass mode = don't cache
      cf.cacheTtl = 0;
      return cf;
    }

    if (this.mode === 'none') {
      // None mode = respect origin headers (no cf options needed)
      return undefined;
    }

    // Override mode - map cross-platform options
    if (typeof this.options.ttl === 'number') {
      cf.cacheTtl = this.options.ttl;
    }

    if (this.options.cacheKey) {
      cf.cacheKey = this.options.cacheKey;
    }

    if (this.options.surrogateKey) {
      // Map surrogateKey to cacheTags (Cloudflare uses array format)
      cf.cacheTags = this.options.surrogateKey.split(/\s+/);
    }

    return Object.keys(cf).length > 0 ? cf : undefined;
  }

  /**
   * Gets the native Fastly CacheOverride instance if available
   * @returns {Promise<object|null>} Native CacheOverride or null
   */
  async getNative() {
    await this.initNative();
    return this.native || null;
  }
}

// Store other APIs (but not fetch - we'll call it dynamically for testability)
const {
  Request: OriginalRequest,
  Response: OriginalResponse,
  Headers: OriginalHeaders,
} = globalThis;

/**
 * Wrapped fetch that supports both cacheOverride and decompress options
 * @param {string|Request} resource - URL or Request object
 * @param {object} [options] - Fetch options with cacheOverride and/or decompress
 * @param {object} [options.cacheOverride] - CacheOverride instance for cache control
 * @param {boolean} [options.decompress=true] - Whether to decompress gzip responses
 * @param {object} [options.fastly] - Fastly-specific options
 * @returns {Promise<Response>} Fetch response
 */
async function wrappedFetch(resource, options = {}) {
  // Check for Cloudflare dynamically (for testability)
  const isInCloudflare = typeof caches !== 'undefined' && caches.default !== undefined;

  // On Cloudflare, strip out Fastly-specific options that aren't supported
  const { cacheOverride, ...restOptions } = options;
  const {
    backend: _backend,
    cacheKey: _cacheKey,
    ...cloudflareOptions
  } = restOptions;

  // Start with base options (strip Fastly-specific on Cloudflare)
  let fetchOptions = isInCloudflare ? cloudflareOptions : restOptions;

  // Handle cacheOverride
  if (cacheOverride) {
    // Initialize native CacheOverride on Fastly if needed
    if (fastlyModulePromise || isFastly) {
      await cacheOverride.initNative();
    }

    if (isFastly && cacheOverride.native) {
      // On Fastly, use native CacheOverride
      fetchOptions = {
        ...fetchOptions,
        cacheOverride: cacheOverride.native,
      };
    } else if (isCloudflare) {
      // On Cloudflare, convert to cf options
      const cfOptions = cacheOverride.toCloudflareOptions();
      if (cfOptions) {
        fetchOptions = {
          ...fetchOptions,
          cf: {
            ...(fetchOptions.cf || {}),
            ...cfOptions,
          },
        };
      }
    }
  }

  // Handle decompress option
  // On Cloudflare: pass through as-is (Cloudflare auto-decompresses)
  // On Fastly/Node.js: map decompress to fastly.decompressGzip (default: true)
  if (!isInCloudflare) {
    const { decompress = true, fastly, ...otherOptions } = fetchOptions;
    fetchOptions = {
      ...otherOptions,
      fastly: {
        decompressGzip: decompress,
        ...fastly, // explicit fastly options override
      },
    };
  }

  return globalThis.fetch(resource, fetchOptions);
}

// Export as default for clean import syntax
export default {
  fetch: wrappedFetch,
  Request: OriginalRequest,
  Response: OriginalResponse,
  Headers: OriginalHeaders,
  CacheOverride: UnifiedCacheOverride,
};

// Named exports for destructuring import syntax
export const fetch = wrappedFetch;
export const Request = OriginalRequest;
export const Response = OriginalResponse;
export const Headers = OriginalHeaders;
export const CacheOverride = UnifiedCacheOverride;

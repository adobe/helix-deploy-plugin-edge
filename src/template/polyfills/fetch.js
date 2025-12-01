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

// Platform detection
let nativeCacheOverride = null;
let isFastly = false;
let isCloudflare = false;

// Detect Cloudflare environment
try {
  // eslint-disable-next-line no-undef
  if (typeof caches !== 'undefined' && caches.default) {
    isCloudflare = true;
  }
} catch {
  // Not Cloudflare
}

// Try to load Fastly's native CacheOverride
async function loadFastlyCacheOverride() {
  try {
    const moduleName = 'fastly:cache-override';
    // eslint-disable-next-line import/no-unresolved
    const module = await import(/* webpackIgnore: true */ moduleName);
    nativeCacheOverride = module.CacheOverride;
    isFastly = true;
    return module;
  } catch {
    return null;
  }
}

// Start loading Fastly module (non-blocking)
const fastlyModulePromise = loadFastlyCacheOverride();

/**
 * Unified CacheOverride class that works across Fastly and Cloudflare platforms
 */
class CacheOverride {
  constructor(modeOrInit, init) {
    let mode;
    let options;

    if (typeof modeOrInit === 'string') {
      mode = modeOrInit;
      options = init || {};
    } else {
      mode = 'override';
      options = modeOrInit || {};
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

  async initNative() {
    if (this.nativeInitialized) return;
    this.nativeInitialized = true;

    await fastlyModulePromise;

    if (isFastly && nativeCacheOverride) {
      const NativeCO = nativeCacheOverride;
      if (typeof this.modeOrInit === 'string') {
        this.native = new NativeCO(this.modeOrInit, this.options);
      } else {
        this.native = new NativeCO(this.options);
      }
    }
  }

  toCloudflareOptions() {
    const cf = {};

    if (this.mode === 'pass') {
      cf.cacheTtl = 0;
      return cf;
    }

    if (this.mode === 'none') {
      return undefined;
    }

    if (typeof this.options.ttl === 'number') {
      cf.cacheTtl = this.options.ttl;
    }
    if (this.options.cacheKey) {
      cf.cacheKey = this.options.cacheKey;
    }
    if (this.options.surrogateKey) {
      cf.cacheTags = this.options.surrogateKey.split(/\s+/);
    }

    return Object.keys(cf).length > 0 ? cf : undefined;
  }
}

/**
 * Wrapped fetch that supports the cacheOverride option
 */
async function wrappedFetch(resource, options = {}) {
  const { cacheOverride, ...restOptions } = options;

  if (!cacheOverride) {
    // No cache override, use global fetch directly
    return globalThis.fetch(resource, restOptions);
  }

  // Initialize native CacheOverride on Fastly if needed
  await cacheOverride.initNative();

  if (isFastly && cacheOverride.native) {
    // On Fastly, use native CacheOverride
    return globalThis.fetch(resource, {
      ...restOptions,
      cacheOverride: cacheOverride.native,
    });
  }

  if (isCloudflare) {
    // On Cloudflare, convert to cf options
    const cfOptions = cacheOverride.toCloudflareOptions();
    if (cfOptions) {
      return globalThis.fetch(resource, {
        ...restOptions,
        cf: {
          ...(restOptions.cf || {}),
          ...cfOptions,
        },
      });
    }
  }

  // Fallback: just use global fetch without cache override
  return globalThis.fetch(resource, restOptions);
}

// Export - using globalThis for Request/Response/Headers as they're always available
export default {
  fetch: wrappedFetch,
  CacheOverride,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
};

export {
  wrappedFetch as fetch,
  CacheOverride,
};
export const { Request } = globalThis;
export const { Response } = globalThis;
export const { Headers } = globalThis;

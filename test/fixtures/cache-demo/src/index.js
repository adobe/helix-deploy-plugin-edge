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
import { Response, fetch, CacheOverride } from '@adobe/fetch';

/**
 * Cache Demo Action
 * Demonstrates cross-platform CacheOverride API usage with httpbin backend
 *
 * Routes:
 * - /cache-demo/long      - Long cache (1 hour)
 * - /cache-demo/short     - Short cache (10 seconds)
 * - /cache-demo/no-cache  - No caching (pass mode)
 * - /cache-demo/custom    - Custom cache key example
 * - /cache-demo/          - Info page
 */
export async function main(req, context) {
  const url = new URL(req.url);
  const path = url.pathname;

  // Backend base URL
  const backendBase = 'https://httpbin.org';

  let cacheOverride;
  let description;
  const backendPath = '/uuid'; // Default: returns a unique ID

  if (path.includes('/long')) {
    // Long cache: 1 hour TTL
    cacheOverride = new CacheOverride('override', {
      ttl: 3600,
      surrogateKey: 'cache-demo long-cache',
    });
    description = 'Long cache (1 hour)';
  } else if (path.includes('/short')) {
    // Short cache: 10 seconds TTL
    cacheOverride = new CacheOverride('override', {
      ttl: 10,
      surrogateKey: 'cache-demo short-cache',
    });
    description = 'Short cache (10 seconds)';
  } else if (path.includes('/no-cache')) {
    // No caching
    cacheOverride = new CacheOverride('pass');
    description = 'No caching (always fresh)';
  } else if (path.includes('/custom')) {
    // Custom cache key example
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const cacheKey = `cache-demo-${userAgent.substring(0, 20)}`;
    cacheOverride = new CacheOverride({
      ttl: 300,
      cacheKey,
      surrogateKey: 'cache-demo custom-key',
    });
    description = `Custom cache key: ${cacheKey}`;
  } else {
    // Info page
    return new Response(
      JSON.stringify({
        name: 'CacheOverride API Demo',
        version: '1.0.0',
        runtime: context?.runtime?.name || 'unknown',
        routes: {
          '/cache-demo/long': 'Long cache (1 hour TTL)',
          '/cache-demo/short': 'Short cache (10 seconds TTL)',
          '/cache-demo/no-cache': 'No caching (pass mode)',
          '/cache-demo/custom': 'Custom cache key (5 minutes TTL)',
        },
        documentation: 'https://github.com/adobe/helix-deploy-plugin-edge',
      }, null, 2),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Cache-Demo': 'info',
        },
      },
    );
  }

  // Fetch from backend with cache override
  const backendUrl = `${backendBase}${backendPath}`;
  const backendResponse = await fetch(backendUrl, {
    backend: 'httpbin.org',
    cacheOverride,
  });

  const backendData = await backendResponse.json();
  const timestamp = new Date().toISOString();

  // Build response
  const responseData = {
    description,
    timestamp,
    runtime: context?.runtime?.name || 'unknown',
    backend: {
      url: backendUrl,
      status: backendResponse.status,
      data: backendData,
    },
    cache: {
      mode: cacheOverride.mode,
      options: cacheOverride.options,
    },
    headers: {
      'cache-control': backendResponse.headers.get('cache-control'),
      age: backendResponse.headers.get('age'),
      'x-cache': backendResponse.headers.get('x-cache'),
    },
  };

  return new Response(JSON.stringify(responseData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Cache-Demo': description,
      'X-Timestamp': timestamp,
    },
  });
}

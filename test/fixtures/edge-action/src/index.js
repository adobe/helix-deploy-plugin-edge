/*
 * Copyright 2020 Adobe. All rights reserved.
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

export async function main(req, context) {
  const url = new URL(req.url);
  const path = url.pathname;

  // CacheOverride API test routes
  if (path.includes('/cache-override-ttl')) {
    // Test: TTL override
    const cacheOverride = new CacheOverride('override', { ttl: 3600 });
    const backendResponse = await fetch('https://www.aem.live/', {
      backend: 'www.aem.live',
      cacheOverride,
    });
    const contentLength = backendResponse.headers.get('content-length') || 'unknown';
    return new Response(`(${context?.func?.name}) ok: cache-override-ttl ttl=3600 size=${contentLength} – ${backendResponse.status}`);
  }

  if (path.includes('/cache-override-pass')) {
    // Test: Pass mode (no caching)
    const cacheOverride = new CacheOverride('pass');
    const backendResponse = await fetch('https://www.aem.live/', {
      backend: 'www.aem.live',
      cacheOverride,
    });
    const contentLength = backendResponse.headers.get('content-length') || 'unknown';
    return new Response(`(${context?.func?.name}) ok: cache-override-pass mode=pass size=${contentLength} – ${backendResponse.status}`);
  }

  if (path.includes('/cache-override-key')) {
    // Test: Custom cache key
    const cacheOverride = new CacheOverride({ ttl: 300, cacheKey: 'test-key' });
    const backendResponse = await fetch('https://www.aem.live/', {
      backend: 'www.aem.live',
      cacheOverride,
    });
    const contentLength = backendResponse.headers.get('content-length') || 'unknown';
    return new Response(`(${context?.func?.name}) ok: cache-override-key cacheKey=test-key size=${contentLength} – ${backendResponse.status}`);
  }

  // Logging test route - only for requests with operation=verbose
  if (url.searchParams.get('operation') === 'verbose') {
    // Configure logger targets dynamically
    const loggers = url.searchParams.get('loggers');
    if (loggers) {
      context.attributes.loggers = loggers.split(',');
    }

    // Example: Structured logging with different levels
    context.log.info({
      action: 'request_started',
      path: url.pathname,
      method: req.method,
    });

    context.log.verbose({
      operation: 'data_processing',
      records: 1000,
      duration_ms: 123,
    });

    // Example: Plain string logging
    context.log.info('Request processed successfully');

    // Example: Silly level (most verbose)
    context.log.silly('Extra verbose logging for development');

    const response = {
      status: 'ok',
      logging: 'enabled',
      loggers: context.attributes.loggers || [],
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // Original status code test - use reliable endpoint (v2)
  console.log(req.url, 'https://www.aem.live/ (updated)');
  const backendresponse = await fetch('https://www.aem.live/', {
    backend: 'www.aem.live',
  });
  const contentLength = backendresponse.headers.get('content-length') || 'unknown';
  console.log(`Response: ${backendresponse.status}, Content-Length: ${contentLength}`);
  return new Response(`(${context?.func?.name}) ok: ${await context.env.HEY} ${await context.env.FOO} – ${backendresponse.status}`);
}

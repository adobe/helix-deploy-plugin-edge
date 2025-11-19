/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { Response, fetch } from '@adobe/fetch';

/**
 * Test action that demonstrates the decompress functionality with caching.
 *
 * Endpoints:
 * - /gzip - Fetches gzipped content from httpbin with decompress: true (default)
 * - /gzip-compressed - Fetches gzipped content with decompress: false
 * - /json - Fetches JSON content with caching
 * - /headers - Returns request headers
 *
 * @param {Request} req - The incoming request
 * @param {Object} context - The execution context
 * @returns {Response} The response
 */
export async function main(req, context) {
  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // Test different decompress scenarios
    if (path.includes('/gzip-compressed')) {
      // Fetch with decompress: false - should receive compressed data
      const response = await fetch('https://httpbin.org/gzip', {
        backend: 'httpbin.org',
        decompress: false,
        cacheKey: 'gzip-compressed',
      });

      const isGzipped = response.headers.get('content-encoding') === 'gzip';

      return new Response(JSON.stringify({
        test: 'decompress-false',
        contentEncoding: response.headers.get('content-encoding'),
        isGzipped,
        status: response.status,
        message: isGzipped ? 'Content is gzipped as expected' : 'Warning: Content not gzipped',
      }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (path.includes('/gzip')) {
      // Fetch with decompress: true (default) - should receive decompressed data
      const response = await fetch('https://httpbin.org/gzip', {
        backend: 'httpbin.org',
        decompress: true,
        cacheKey: 'gzip-decompressed',
      });

      const data = await response.json();
      const isDecompressed = !response.headers.get('content-encoding');

      return new Response(JSON.stringify({
        test: 'decompress-true',
        contentEncoding: response.headers.get('content-encoding') || 'none',
        isDecompressed,
        gzipped: data.gzipped || false,
        status: response.status,
        message: isDecompressed ? 'Content decompressed successfully' : 'Warning: Content still encoded',
      }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (path.includes('/json')) {
      // Test JSON endpoint with caching
      const response = await fetch('https://httpbin.org/json', {
        backend: 'httpbin.org',
        cacheKey: 'json-data',
      });

      const data = await response.json();

      return new Response(JSON.stringify({
        test: 'json-cached',
        slideshow: data.slideshow?.title || 'unknown',
        status: response.status,
        cached: response.headers.get('x-cache') === 'HIT',
      }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (path.includes('/headers')) {
      // Return request headers for debugging
      const headers = {};
      req.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return new Response(JSON.stringify({
        test: 'headers',
        headers,
        context: {
          functionName: context?.func?.name,
          runtime: context?.runtime?.name,
        },
      }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Default response with usage instructions
    return new Response(JSON.stringify({
      name: 'decompress-test',
      version: '1.0.0',
      endpoints: [
        { path: '/gzip', description: 'Test decompress: true (default) - receives decompressed content' },
        { path: '/gzip-compressed', description: 'Test decompress: false - receives compressed content' },
        { path: '/json', description: 'Test JSON endpoint with caching' },
        { path: '/headers', description: 'View request headers and context' },
      ],
      runtime: context?.runtime?.name,
      region: context?.runtime?.region,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack,
    }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

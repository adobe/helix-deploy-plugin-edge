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
 * Simple edge action for testing ESBuild bundler
 * Returns proper Response objects
 */
export async function main(request, context) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Health check
  if (path === '/health' || path.endsWith('/health')) {
    return new Response('OK', { status: 200 });
  }

  // Info endpoint
  if (path === '/info' || path.endsWith('/info')) {
    const info = {
      platform: context?.runtime?.name || 'unknown',
      path,
      method: request.method,
      timestamp: new Date().toISOString(),
    };
    return new Response(JSON.stringify(info, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Default response
  const platform = context?.runtime?.name || 'unknown';
  return new Response(`Hello from ${platform} (esbuild bundle)!\n`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

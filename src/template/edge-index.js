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

// Static imports to avoid code splitting (Fastly runtime doesn't support importScripts)
import { handleRequest as handleCloudflareRequest } from './cloudflare-adapter.js';
import { handleRequest as handleFastlyRequest } from './fastly-adapter.js';

// Platform detection based on request properties and runtime-specific modules
let detectedPlatform = null;

async function detectPlatform(request) {
  if (detectedPlatform) return detectedPlatform;

  // Check for Cloudflare by testing for request.cf property
  // https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties
  if (request && request.cf) {
    detectedPlatform = 'cloudflare';
    // eslint-disable-next-line no-console
    console.log('detected cloudflare environment');
    return detectedPlatform;
  }

  // Try Fastly by checking for fastly:env module
  try {
    /* eslint-disable-next-line import/no-unresolved */
    await import(/* webpackIgnore: true */ 'fastly:env');
    detectedPlatform = 'fastly';
    // eslint-disable-next-line no-console
    console.log('detected fastly environment');
    return detectedPlatform;
  } catch {
    // Not Fastly
  }

  return null;
}

async function getHandler(request) {
  const platform = await detectPlatform(request);

  if (platform === 'cloudflare') {
    return handleCloudflareRequest;
  }

  if (platform === 'fastly') {
    return handleFastlyRequest;
  }

  return null;
}

// eslint-disable-next-line no-restricted-globals
addEventListener('fetch', (event) => {
  event.respondWith(
    getHandler(event.request).then((handler) => {
      if (typeof handler === 'function') {
        return handler(event);
      }
      return new Response('Unknown platform', { status: 500 });
    }),
  );
});

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

// eslint-disable-next-line no-console
console.log('=== EDGE-INDEX.JS LOADING ===');

async function detectPlatform(request) {
  // eslint-disable-next-line no-console
  console.log('detectPlatform called, cached:', detectedPlatform);

  if (detectedPlatform) return detectedPlatform;

  // eslint-disable-next-line no-console
  console.log('detectPlatform: checking request.cf, request exists:', !!request);
  // eslint-disable-next-line no-console
  console.log('detectPlatform: request.cf =', request?.cf);

  // Check for Cloudflare by testing for request.cf property
  // https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties
  if (request && request.cf) {
    detectedPlatform = 'cloudflare';
    // eslint-disable-next-line no-console
    console.log('detected cloudflare environment via request.cf');
    return detectedPlatform;
  }

  // eslint-disable-next-line no-console
  console.log('detectPlatform: no request.cf, trying fastly:env import');

  // Try Fastly by checking for fastly:env module
  try {
    /* eslint-disable-next-line import/no-unresolved */
    await import(/* webpackIgnore: true */ 'fastly:env');
    detectedPlatform = 'fastly';
    // eslint-disable-next-line no-console
    console.log('detected fastly environment via fastly:env import');
    return detectedPlatform;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log('detectPlatform: fastly:env import failed:', err?.message || err);
  }

  // eslint-disable-next-line no-console
  console.log('detectPlatform: no platform detected, returning null');
  return null;
}

async function getHandler(request) {
  // eslint-disable-next-line no-console
  console.log('getHandler called');
  const platform = await detectPlatform(request);
  // eslint-disable-next-line no-console
  console.log('getHandler: platform detected as:', platform);

  if (platform === 'cloudflare') {
    // eslint-disable-next-line no-console
    console.log('getHandler: returning cloudflare handler');
    return handleCloudflareRequest;
  }

  if (platform === 'fastly') {
    // eslint-disable-next-line no-console
    console.log('getHandler: returning fastly handler');
    return handleFastlyRequest;
  }

  // eslint-disable-next-line no-console
  console.log('getHandler: no handler found, returning null');
  return null;
}

// eslint-disable-next-line no-console
console.log('=== REGISTERING FETCH EVENT LISTENER ===');

// eslint-disable-next-line no-restricted-globals
addEventListener('fetch', (event) => {
  // eslint-disable-next-line no-console
  console.log('=== FETCH EVENT RECEIVED ===');
  // eslint-disable-next-line no-console
  console.log('event.request.url:', event.request?.url);

  event.respondWith(
    getHandler(event.request).then((handler) => {
      // eslint-disable-next-line no-console
      console.log('getHandler resolved, handler type:', typeof handler);
      if (typeof handler === 'function') {
        return handler(event);
      }
      // eslint-disable-next-line no-console
      console.log('ERROR: No handler found - Unknown platform');
      return new Response('Unknown platform', { status: 500 });
    }),
  );
});

// eslint-disable-next-line no-console
console.log('=== EDGE-INDEX.JS FULLY LOADED ===');

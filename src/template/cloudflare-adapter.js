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
import { extractPathFromURL } from './adapter-utils.js';

export async function handleRequest(event) {
  try {
    const { request } = event;
    // eslint-disable-next-line import/no-unresolved,global-require
    const { main } = require('./main.js');
    const context = {
      resolver: null,
      pathInfo: {
        suffix: extractPathFromURL(request),
      },
      runtime: {
        name: 'cloudflare-workers',
        region: request.cf.colo,
      },
      func: {
        name: null,
        package: null,
        version: null,
        fqn: null,
        app: null,
      },
      invocation: {
        id: null,
        deadline: null,
        transactionId: null,
        requestId: null,
      },
      // eslint-disable-next-line no-undef
      env: new Proxy(globalThis, {
        get: (target, prop) => target[prop] || target.PACKAGE.get(prop),
      }),
      storage: null,
    };
    return await main(request, context);
  } catch (e) {
    console.log(e.message);
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}

/**
 * Detects if the code is running in a cloudflare environment.
 * @returns {null|(function(*): Promise<*|Response|undefined>)|*}
 */
export default function cloudflare() {
  try {
    if (caches.default) {
      console.log('detected cloudflare environment');
      return handleRequest;
    }
  } catch {
    // ignore
  }
  return null;
}

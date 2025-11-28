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
import { createFastlyLogger } from './context-logger.js';
import { getFastlyEnv, getSecretStore } from './fastly-runtime.js';

export function getEnvInfo(req, env) {
  const serviceVersion = env('FASTLY_SERVICE_VERSION');
  const requestId = env('FASTLY_TRACE_ID');
  const region = env('FASTLY_POP');
  const functionName = env('FASTLY_SERVICE_ID');
  const functionFQN = `${env('FASTLY_CUSTOMER_ID')}-${functionName}-${serviceVersion}`;
  const txId = req.headers.get('x-transaction-id') ?? env('FASTLY_TRACE_ID');

  // eslint-disable-next-line no-console
  console.debug('Env info sv: ', serviceVersion, ' reqId: ', requestId, ' region: ', region, ' functionName: ', functionName, ' functionFQN: ', functionFQN, ' txId: ', txId);

  return {
    functionFQN,
    functionName,
    region,
    requestId,
    serviceVersion,
    txId,
  };
}

async function getEnvironmentInfo(req) {
  const mod = await getFastlyEnv();
  return getEnvInfo(req, mod.env);
}

export async function handleRequest(event) {
  try {
    const { request } = event;
    const env = await getEnvironmentInfo(request);

    // eslint-disable-next-line no-console
    console.log('Fastly Adapter is here');
    // eslint-disable-next-line import/no-unresolved,global-require
    const { main } = require('./main.js');
    const context = {
      resolver: null,
      pathInfo: {
        suffix: extractPathFromURL(request),
      },
      runtime: {
        name: 'compute-at-edge',
        region: env.region,
      },
      func: {
        name: env.functionName,
        package: null,
        version: env.serviceVersion,
        fqn: env.functionFQN,
        app: null,
      },
      invocation: {
        id: null,
        deadline: null,
        transactionId: env.txId,
        requestId: env.requestId,
      },
      env: new Proxy({}, {
        get: (target, prop) => {
          // Return undefined for non-string properties (like Symbol.iterator)
          if (typeof prop !== 'string') {
            return undefined;
          }

          // Load SecretStore dynamically and access secrets
          return getSecretStore().then((SecretStore) => {
            if (!SecretStore) {
              return undefined;
            }
            // Try action_secrets first (action-specific params - highest priority)
            const actionSecrets = new SecretStore('action_secrets');
            return actionSecrets.get(prop).then((secret) => {
              if (secret) {
                return secret.plaintext();
              }
              // Try package_secrets next (package-wide params)
              const packageSecrets = new SecretStore('package_secrets');
              return packageSecrets.get(prop).then((pkgSecret) => {
                if (pkgSecret) {
                  return pkgSecret.plaintext();
                }
                return undefined;
              });
            });
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.error(`Error accessing secrets for ${prop}: ${err.message}`);
            return undefined;
          });
        },
      }),
      storage: null,
      attributes: {},
    };

    // Initialize logger after context is created
    // Logger dynamically checks context.attributes.loggers on each call
    context.log = createFastlyLogger(context);

    return await main(request, context);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e.message);
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}

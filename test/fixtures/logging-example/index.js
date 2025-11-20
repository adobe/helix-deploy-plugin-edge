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
import { Response } from '@adobe/fetch';

/**
 * Example demonstrating context.log usage with all log levels.
 * This fixture shows how to use the unified logging API in edge workers.
 */
export function main(req, context) {
  const url = new URL(req.url);

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

  try {
    // Simulate some processing
    const operation = url.searchParams.get('operation');

    if (operation === 'verbose') {
      context.log.verbose({
        operation: 'data_processing',
        records: 1000,
        duration_ms: 123,
      });
    }

    if (operation === 'debug') {
      context.log.debug({
        debug_info: 'detailed debugging information',
        variables: { a: 1, b: 2 },
      });
    }

    if (operation === 'fail') {
      context.log.error('Simulated error condition');
      throw new Error('Operation failed');
    }

    if (operation === 'fatal') {
      context.log.fatal({
        error: 'Critical system error',
        code: 'SYSTEM_FAILURE',
      });
      return new Response('Fatal error', { status: 500 });
    }

    // Example: Plain string logging
    context.log.info('Request processed successfully');

    // Example: Warning logging
    if (url.searchParams.has('deprecated')) {
      context.log.warn({
        warning: 'Using deprecated parameter',
        parameter: 'deprecated',
      });
    }

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
  } catch (error) {
    context.log.error({
      error: error.message,
      stack: error.stack,
    });

    return new Response(JSON.stringify({
      error: error.message,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

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
/* eslint-env serviceworker */

/**
 * Normalizes log input to always be an object.
 * Converts string inputs to { message: string } format.
 * @param {*} data - The log data (string or object)
 * @returns {object} Normalized log object
 */
export function normalizeLogData(data) {
  if (typeof data === 'string') {
    return { message: data };
  }
  if (typeof data === 'object' && data !== null) {
    return { ...data };
  }
  return { message: String(data) };
}

/**
 * Enriches log data with context metadata.
 * @param {object} data - The log data object
 * @param {string} level - The log level (debug, info, warn, error)
 * @param {object} context - The context object with metadata
 * @returns {object} Enriched log object
 */
export function enrichLogData(data, level, context) {
  return {
    timestamp: new Date().toISOString(),
    level,
    requestId: context.invocation?.requestId,
    transactionId: context.invocation?.transactionId,
    functionName: context.func?.name,
    functionVersion: context.func?.version,
    functionFQN: context.func?.fqn,
    region: context.runtime?.region,
    ...data,
  };
}

/**
 * Creates a logger instance for Fastly using fastly:logger module.
 * Uses async import and handles initialization.
 * @param {string[]} loggerNames - Array of logger endpoint names
 * @param {object} context - The context object
 * @returns {object} Logger instance with level methods
 */
export function createFastlyLogger(loggerNames, context) {
  const loggers = [];
  let loggersReady = false;
  let loggerPromise = null;

  // Initialize Fastly loggers asynchronously
  if (loggerNames && loggerNames.length > 0) {
    loggerPromise = import('fastly:logger').then((module) => {
      loggerNames.forEach((name) => {
        try {
          loggers.push(new module.Logger(name));
        } catch (err) {
          console.error(`Failed to create Fastly logger "${name}": ${err.message}`);
        }
      });
      loggersReady = true;
      loggerPromise = null;
    }).catch((err) => {
      console.error(`Failed to import fastly:logger: ${err.message}`);
      loggersReady = true;
      loggerPromise = null;
    });
  } else {
    // No loggers configured, mark as ready immediately
    loggersReady = true;
  }

  /**
   * Sends a log entry to all configured Fastly loggers.
   * @param {string} level - Log level
   * @param {*} data - Log data
   */
  const log = (level, data) => {
    const normalizedData = normalizeLogData(data);
    const enrichedData = enrichLogData(normalizedData, level, context);
    const logEntry = JSON.stringify(enrichedData);

    // If loggers are still initializing, wait for them
    if (loggerPromise) {
      loggerPromise.then(() => {
        if (loggers.length > 0) {
          loggers.forEach((logger) => {
            try {
              logger.log(logEntry);
            } catch (err) {
              console.error(`Failed to log to Fastly logger: ${err.message}`);
            }
          });
        } else {
          // Fallback to console if no loggers configured
          console.log(logEntry);
        }
      });
    } else if (loggersReady) {
      if (loggers.length > 0) {
        loggers.forEach((logger) => {
          try {
            logger.log(logEntry);
          } catch (err) {
            console.error(`Failed to log to Fastly logger: ${err.message}`);
          }
        });
      } else {
        // Fallback to console if no loggers configured
        console.log(logEntry);
      }
    }
  };

  return {
    debug: (data) => log('debug', data),
    info: (data) => log('info', data),
    warn: (data) => log('warn', data),
    error: (data) => log('error', data),
  };
}

/**
 * Creates a logger instance for Cloudflare that emits console logs
 * with target field for tail worker filtering.
 * @param {string[]} loggerNames - Array of logger target names
 * @param {object} context - The context object
 * @returns {object} Logger instance with level methods
 */
export function createCloudflareLogger(loggerNames, context) {
  /**
   * Sends a log entry to console for each configured target.
   * Each entry includes a 'target' field for tail worker filtering.
   * @param {string} level - Log level
   * @param {*} data - Log data
   */
  const log = (level, data) => {
    const normalizedData = normalizeLogData(data);
    const enrichedData = enrichLogData(normalizedData, level, context);

    if (loggerNames && loggerNames.length > 0) {
      // Emit one log per target for tail worker filtering
      loggerNames.forEach((target) => {
        const logEntry = JSON.stringify({
          target,
          ...enrichedData,
        });
        console.log(logEntry);
      });
    } else {
      // No targets configured, just log to console
      console.log(JSON.stringify(enrichedData));
    }
  };

  return {
    debug: (data) => log('debug', data),
    info: (data) => log('info', data),
    warn: (data) => log('warn', data),
    error: (data) => log('error', data),
  };
}

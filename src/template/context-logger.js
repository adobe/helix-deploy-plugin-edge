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
 * Dynamically checks context.attributes.loggers on each call.
 * @param {object} context - The context object
 * @returns {object} Logger instance with level methods
 */
export function createFastlyLogger(context) {
  const loggers = {};
  let loggersReady = false;
  let loggerPromise = null;
  let loggerModule = null;

  // Initialize Fastly logger module asynchronously
  // eslint-disable-next-line import/no-unresolved
  loggerPromise = import('fastly:logger').then((module) => {
    loggerModule = module;
    loggersReady = true;
    loggerPromise = null;
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`Failed to import fastly:logger: ${err.message}`);
    loggersReady = true;
    loggerPromise = null;
  });

  /**
   * Gets or creates logger instances for configured targets.
   * @param {string[]} loggerNames - Array of logger endpoint names
   * @returns {object[]} Array of logger instances
   */
  const getLoggers = (loggerNames) => {
    if (!loggerNames || loggerNames.length === 0) {
      return [];
    }

    const instances = [];
    loggerNames.forEach((name) => {
      if (!loggers[name]) {
        try {
          loggers[name] = new loggerModule.Logger(name);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`Failed to create Fastly logger "${name}": ${err.message}`);
          return;
        }
      }
      instances.push(loggers[name]);
    });
    return instances;
  };

  /**
   * Sends a log entry to all configured Fastly loggers.
   * Dynamically checks context.attributes.loggers on each call.
   * @param {string} level - Log level
   * @param {*} data - Log data
   */
  const log = (level, data) => {
    const normalizedData = normalizeLogData(data);
    const enrichedData = enrichLogData(normalizedData, level, context);
    const logEntry = JSON.stringify(enrichedData);

    // Get current logger configuration from context
    const loggerNames = context.attributes?.loggers;

    // If loggers are still initializing, wait for them
    if (loggerPromise) {
      loggerPromise.then(() => {
        const currentLoggers = getLoggers(loggerNames);
        if (currentLoggers.length > 0) {
          currentLoggers.forEach((logger) => {
            try {
              logger.log(logEntry);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error(`Failed to log to Fastly logger: ${err.message}`);
            }
          });
        } else {
          // Fallback to console if no loggers configured
          // eslint-disable-next-line no-console
          console.log(logEntry);
        }
      });
    } else if (loggersReady) {
      const currentLoggers = getLoggers(loggerNames);
      if (currentLoggers.length > 0) {
        currentLoggers.forEach((logger) => {
          try {
            logger.log(logEntry);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`Failed to log to Fastly logger: ${err.message}`);
          }
        });
      } else {
        // Fallback to console if no loggers configured
        // eslint-disable-next-line no-console
        console.log(logEntry);
      }
    }
  };

  return {
    fatal: (data) => log('fatal', data),
    error: (data) => log('error', data),
    warn: (data) => log('warn', data),
    info: (data) => log('info', data),
    verbose: (data) => log('verbose', data),
    debug: (data) => log('debug', data),
    silly: (data) => log('silly', data),
  };
}

/**
 * Creates a logger instance for Cloudflare that emits console logs
 * using tab-separated format for efficient tail worker filtering.
 * Format: target\tlevel\tjson_body
 * Dynamically checks context.attributes.loggers on each call.
 * @param {object} context - The context object
 * @returns {object} Logger instance with level methods
 */
export function createCloudflareLogger(context) {
  /**
   * Sends a log entry to console for each configured target.
   * Uses tab-separated format: target\tlevel\tjson_body
   * This allows tail workers to efficiently filter without parsing JSON.
   * @param {string} level - Log level
   * @param {*} data - Log data
   */
  const log = (level, data) => {
    const normalizedData = normalizeLogData(data);
    const enrichedData = enrichLogData(normalizedData, level, context);
    const body = JSON.stringify(enrichedData);

    // Get current logger configuration from context
    const loggerNames = context.attributes?.loggers;

    if (loggerNames && loggerNames.length > 0) {
      // Emit one log per target using tab-separated format
      // Format: target\tlevel\tjson_body
      loggerNames.forEach((target) => {
        // eslint-disable-next-line no-console
        console.log(`${target}\t${level}\t${body}`);
      });
    } else {
      // No targets configured, emit without target prefix
      // eslint-disable-next-line no-console
      console.log(`-\t${level}\t${body}`);
    }
  };

  return {
    fatal: (data) => log('fatal', data),
    error: (data) => log('error', data),
    warn: (data) => log('warn', data),
    info: (data) => log('info', data),
    verbose: (data) => log('verbose', data),
    debug: (data) => log('debug', data),
    silly: (data) => log('silly', data),
  };
}

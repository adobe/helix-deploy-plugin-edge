# Logging and Console API Unification

This document analyzes the logging and console APIs for Fastly Compute and Cloudflare Workers, providing strategies for creating a unified abstraction layer.

## Table of Contents

1. [Console API Comparison](#console-api-comparison)
2. [Custom Logging Endpoints](#custom-logging-endpoints)
3. [Log Viewing and Tailing](#log-viewing-and-tailing)
4. [Structured Logging](#structured-logging)
5. [Unification Strategy](#unification-strategy)
6. [Adapter Patterns](#adapter-patterns)

---

## Console API Comparison

### Fastly Compute Console API

**Platform**: Fastly Compute
**Purpose**: Standard debugging output via stdout/stderr
**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/globals/console/

#### Supported Methods

| Method | Status | Description |
|--------|--------|-------------|
| `console.log()` | Full | Outputs message to stdout |
| `console.error()` | Full | Outputs error message to stderr |
| `console.warn()` | Full | Outputs warning message |
| `console.info()` | Full | Outputs informational message |
| `console.debug()` | Full | Outputs debug message |
| `console.trace()` | Full | Outputs stack trace |
| `console.assert()` | Full | Conditional error output |
| `console.timeLog()` | Full | Logs timer value |

#### Key Characteristics

- Output goes to stdout/stderr
- Viewable via `fastly log-tail` command
- Supports multiple arguments concatenated as strings
- Returns `undefined`
- No special formatting support mentioned (no `%s`, `%d` substitutions documented)

#### Example Usage

```javascript
console.log('Request received:', request.method, request.url);
console.error('Failed to process:', error.message);
console.debug('Env info sv:', serviceVersion, 'reqId:', requestId);
```

---

### Cloudflare Workers Console API

**Platform**: Cloudflare Workers
**Purpose**: Standard debugging and logging output
**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/console/

#### Supported Methods

| Method | Status | Environment | Description |
|--------|--------|-------------|-------------|
| `console.log()` | Full | All | General logging |
| `console.error()` | Full | All | Error messages |
| `console.warn()` | Full | All | Warning messages |
| `console.info()` | Full | All | Informational messages |
| `console.debug()` | Full | All | Debug messages |
| `console.trace()` | Partial | Dev/Preview only | Stack trace (no-op in production) |
| `console.table()` | Partial | Dev/Preview only | Tabular data display |
| `console.group()` | Partial | Dev/Preview only | Group messages |
| `console.count()` | Partial | Dev/Preview only | Call counter |
| `console.clear()` | Partial | Dev/Preview only | Clear console |
| `console.assert()` | No-op | N/A | Does nothing |
| `console.time()` | No-op | N/A | Does nothing |
| `console.timeEnd()` | No-op | N/A | Does nothing |
| `console.timeLog()` | No-op | N/A | Does nothing |
| `console.dir()` | No-op | N/A | Does nothing |
| `console.createTask()` | Error | N/A | Throws in production |

#### Key Characteristics

- Output visible in Workers Logs, dashboard, and `wrangler tail`
- Logs are indexed and queryable when using Workers Logs
- Best practice: Log JSON objects for structured data
- Appears in `logs` field of Tail Worker events
- Log retention: 3 days (Free), 7 days (Paid)

#### Example Usage

```javascript
// Recommended: Structured logging
console.log({ user_id: 123, action: 'login', timestamp: Date.now() });

// Standard logging
console.error('Request failed:', error.message);
console.warn('Deprecation notice');
```

---

## Custom Logging Endpoints

### Fastly Logger API

**Platform**: Fastly Compute
**Purpose**: Send logs to external logging services
**Module**: `fastly:logger`
**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:logger/Logger/

#### API Overview

```javascript
import { Logger } from 'fastly:logger';

const logger = new Logger('endpoint-name');
logger.log(message);
```

#### Constructor

```javascript
new Logger(name)
```

- **name** (string): Name of the configured logging endpoint
- Must be constructed with `new`
- Can only be used during request processing (not build-time initialization)

#### Methods

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `log(message)` | Any (converted to string) | `undefined` | Sends message to endpoint |

#### Supported Logging Providers

Fastly supports extensive third-party logging integrations:

**Cloud Storage**:
- Amazon S3
- Google Cloud Storage
- Azure Blob Storage
- DigitalOcean Spaces

**SIEM & Analytics**:
- Splunk
- Datadog
- BigQuery
- New Relic
- Sumo Logic
- Elasticsearch
- Kafka

**Other**:
- Syslog
- HTTPS endpoints
- FTP
- Honeycomb
- Coralogix

#### Configuration

Logging endpoints are configured in `fastly.toml`:

```toml
[setup.log_endpoints.splunk]
type = "splunk"
address = "splunk.example.com"

[setup.log_endpoints.s3]
type = "s3"
bucket_name = "my-logs"
```

#### Example Usage

```javascript
import { Logger } from 'fastly:logger';

async function handleRequest(event) {
  const logger = new Logger('splunk');

  // Log structured data
  logger.log(JSON.stringify({
    method: event.request.method,
    url: event.request.url,
    timestamp: Date.now(),
    region: 'us-east-1'
  }));

  return new Response('OK');
}
```

---

### Cloudflare Workers Logging Options

**Platform**: Cloudflare Workers
**Purpose**: Persistent logging and external service integration

#### 1. Workers Logs (Built-in)

**Documentation**: https://developers.cloudflare.com/workers/observability/logs/workers-logs/

**Features**:
- Automatic collection of invocation logs
- Custom `console.log()` statements captured
- Indexed and queryable fields
- Retention: 3-7 days based on plan

**Configuration** (wrangler.toml):

```toml
[observability]
enabled = true
head_sampling_rate = 1  # 0-1, percentage of requests logged
```

**Pricing**: $0.60 per million logs (above plan allocation)

---

#### 2. Logpush

**Documentation**: https://developers.cloudflare.com/workers/observability/logs/logpush/

**Purpose**: Push Workers Trace Event Logs to external destinations

**Supported Destinations**:
- Cloudflare R2
- Amazon S3
- Google Cloud Storage
- Microsoft Azure
- BigQuery
- Splunk
- Datadog
- Elastic
- New Relic
- Sumo Logic
- IBM QRadar
- Amazon Kinesis
- HTTP endpoints

**Data Included**:
- Request/response metadata
- `console.log()` messages
- Uncaught exceptions
- Script name, outcome, timestamps

**Configuration**:

```toml
# wrangler.toml
logpush = true
```

**Limits**:
- Combined `logs` and `exceptions` fields: 16,384 characters
- Workers Paid plan only

---

#### 3. Tail Workers

**Documentation**: https://developers.cloudflare.com/workers/observability/logs/tail-workers/

**Purpose**: Process logs programmatically within Workers

**Producer Worker Configuration**:

```jsonc
// wrangler.jsonc
{
  "tail_consumers": [
    {
      "service": "my-tail-worker"
    }
  ]
}
```

**Tail Worker Handler**:

```javascript
export default {
  async tail(events) {
    // Process log events
    for (const event of events) {
      // event contains: scriptName, outcome, logs, exceptions, etc.
      await fetch('https://analytics.example.com', {
        method: 'POST',
        body: JSON.stringify(event)
      });
    }
  }
}
```

**Event Object Structure**:

```javascript
{
  scriptName: 'my-worker',
  outcome: 'ok',
  eventTimestamp: 1234567890,
  logs: [
    { level: 'log', message: ['User logged in'] }
  ],
  exceptions: [],
  request: {
    url: 'https://example.com',
    method: 'GET',
    headers: {}
  }
}
```

---

## Log Viewing and Tailing

### Fastly

**Command**: `fastly log-tail`

```bash
fastly log-tail --service-id <SERVICE_ID>
```

- Real-time stdout/stderr streaming
- Monitors live service output
- Shows runtime errors

### Cloudflare

**Command**: `wrangler tail`

```bash
npx wrangler tail [worker-name]
npx wrangler tail --format=pretty --status=error
npx wrangler tail --method=GET --sampling-rate=0.1
```

**Dashboard**: Workers & Pages > Worker > Logs > Live

**Limitations**:
- Max 10 concurrent clients
- Logs not persisted (use Workers Logs for persistence)
- High traffic may trigger sampling mode
- WebSocket handler logs hidden until connection closes

---

## Structured Logging

### Best Practices

#### Fastly Compute

```javascript
import { Logger } from 'fastly:logger';

const logger = new Logger('analytics');

function logRequest(request, response, duration) {
  logger.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    status: response.status,
    duration_ms: duration,
    user_agent: request.headers.get('user-agent')
  }));
}
```

#### Cloudflare Workers

```javascript
// Recommended: Log objects directly
console.log({
  timestamp: Date.now(),
  level: 'info',
  message: 'Request processed',
  user_id: 123,
  action: 'purchase',
  amount: 99.99
});

// Avoid string concatenation (not indexed)
// console.log('user_id: ' + 123);  // BAD
```

---

## Unification Strategy

### Compatibility Matrix

| Feature | Fastly | Cloudflare | Unified Approach |
|---------|--------|------------|------------------|
| `console.log()` | Full | Full | Direct passthrough |
| `console.error()` | Full | Full | Direct passthrough |
| `console.warn()` | Full | Full | Direct passthrough |
| `console.info()` | Full | Full | Direct passthrough |
| `console.debug()` | Full | Full | Direct passthrough |
| `console.trace()` | Full | Partial | Conditional wrapper |
| `console.time()` | Full | No-op | Polyfill for CF |
| Custom endpoints | Logger class | Logpush/Tail Workers | Abstract adapter |
| Log tailing | `fastly log-tail` | `wrangler tail` | Platform-specific |
| Structured logs | Manual JSON | Native JSON objects | Standardize to JSON |

### Recommended Unified Interface

```typescript
interface UnifiedLogger {
  // Standard console methods (direct passthrough)
  log(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  info(...args: any[]): void;
  debug(...args: any[]): void;

  // Structured logging
  logStructured(data: Record<string, any>): void;

  // Custom endpoint logging (Fastly Logger equivalent)
  sendToEndpoint(endpointName: string, data: any): void;
}
```

---

## Adapter Patterns

### Unified Console Logger

```javascript
/**
 * Unified console logging wrapper that normalizes behavior
 * across Fastly Compute and Cloudflare Workers
 */
export class UnifiedConsole {
  constructor() {
    this.platform = this.detectPlatform();
  }

  detectPlatform() {
    try {
      // Cloudflare Workers detection
      if (typeof caches !== 'undefined' && caches.default) {
        return 'cloudflare';
      }
    } catch {}

    try {
      // Fastly detection
      if (typeof CacheOverride !== 'undefined') {
        return 'fastly';
      }
    } catch {}

    return 'unknown';
  }

  /**
   * Standard logging methods - direct passthrough
   */
  log(...args) {
    console.log(...args);
  }

  error(...args) {
    console.error(...args);
  }

  warn(...args) {
    console.warn(...args);
  }

  info(...args) {
    console.info(...args);
  }

  debug(...args) {
    console.debug(...args);
  }

  /**
   * Structured logging - ensures JSON format for both platforms
   * Cloudflare: Logs as queryable object
   * Fastly: Logs as JSON string
   */
  logStructured(level, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      platform: this.platform,
      ...data
    };

    if (this.platform === 'cloudflare') {
      // Cloudflare indexes object properties
      console[level](entry);
    } else {
      // Fastly expects string output
      console[level](JSON.stringify(entry));
    }
  }

  /**
   * Timing wrapper - polyfills for Cloudflare where console.time is no-op
   */
  time(label) {
    if (this.platform === 'cloudflare') {
      this._timers = this._timers || {};
      this._timers[label] = performance.now();
    } else {
      console.time(label);
    }
  }

  timeEnd(label) {
    if (this.platform === 'cloudflare') {
      if (this._timers && this._timers[label]) {
        const duration = performance.now() - this._timers[label];
        console.log(`${label}: ${duration.toFixed(2)}ms`);
        delete this._timers[label];
      }
    } else {
      console.timeEnd(label);
    }
  }
}
```

### Custom Endpoint Logger Adapter

```javascript
/**
 * Unified adapter for sending logs to external endpoints
 *
 * Fastly: Uses Logger class to configured endpoints
 * Cloudflare: Uses Tail Workers or Logpush configuration
 */
export class EndpointLogger {
  constructor(endpointName, options = {}) {
    this.endpointName = endpointName;
    this.options = options;
    this.platform = this.detectPlatform();
    this._logger = null;
  }

  detectPlatform() {
    try {
      if (typeof caches !== 'undefined' && caches.default) {
        return 'cloudflare';
      }
    } catch {}

    try {
      if (typeof CacheOverride !== 'undefined') {
        return 'fastly';
      }
    } catch {}

    return 'unknown';
  }

  /**
   * Initialize logger (platform-specific)
   */
  async init() {
    if (this.platform === 'fastly') {
      // Dynamically import Fastly Logger
      const { Logger } = await import('fastly:logger');
      this._logger = new Logger(this.endpointName);
    }
    // Cloudflare uses console.log which is captured by Logpush/Tail Workers
    return this;
  }

  /**
   * Send structured log to endpoint
   */
  log(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);

    if (this.platform === 'fastly' && this._logger) {
      this._logger.log(payload);
    } else if (this.platform === 'cloudflare') {
      // Cloudflare: Log to console, Logpush/Tail Workers capture it
      console.log({
        __endpoint: this.endpointName,
        ...data
      });
    } else {
      // Fallback
      console.log(`[${this.endpointName}]`, data);
    }
  }

  /**
   * Log with automatic metadata
   */
  logWithMetadata(level, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      endpoint: this.endpointName,
      ...metadata
    };

    this.log(entry);
  }
}

// Usage example
async function handleRequest(request) {
  const logger = await new EndpointLogger('analytics').init();

  logger.logWithMetadata('info', 'Request received', {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent')
  });

  // Process request...

  return new Response('OK');
}
```

### Complete Unified Logging Factory

```javascript
/**
 * Factory for creating platform-aware loggers
 */
export function createLogger(config = {}) {
  const {
    structured = false,
    endpoint = null,
    includeTimestamp = true,
    includePlatform = true
  } = config;

  const console = new UnifiedConsole();

  if (endpoint) {
    return new EndpointLogger(endpoint);
  }

  if (structured) {
    return {
      log: (data) => console.logStructured('log', data),
      error: (data) => console.logStructured('error', data),
      warn: (data) => console.logStructured('warn', data),
      info: (data) => console.logStructured('info', data),
      debug: (data) => console.logStructured('debug', data)
    };
  }

  return console;
}

// Usage examples

// Standard logging
const logger = createLogger();
logger.log('Simple message');
logger.error('Error occurred', error);

// Structured logging
const structuredLogger = createLogger({ structured: true });
structuredLogger.info({
  action: 'user_login',
  user_id: 123,
  ip_address: '1.2.3.4'
});

// Endpoint logging (external service)
const analyticsLogger = createLogger({ endpoint: 'analytics' });
await analyticsLogger.init();
analyticsLogger.log({ event: 'pageview', path: '/home' });
```

---

## Platform-Specific Features

### Fastly-Only Features

1. **Named Logger Endpoints**: Direct integration with 30+ logging providers
2. **Console Timing**: Full `console.time()` / `console.timeEnd()` support
3. **enableDebugLogging()**: Runtime debug mode activation

### Cloudflare-Only Features

1. **Workers Logs**: Automatic indexing and querying of log fields
2. **Tail Workers**: Programmatic log processing within Workers
3. **Log Sampling**: Configurable `head_sampling_rate` for cost control
4. **Dashboard Real-time Logs**: GUI-based log viewing

---

## Migration Considerations

### From Fastly to Cloudflare

```javascript
// Fastly Logger usage
import { Logger } from 'fastly:logger';
const splunkLogger = new Logger('splunk');
splunkLogger.log(JSON.stringify(data));

// Cloudflare equivalent
// 1. Configure Logpush to Splunk
// 2. Use console.log with structured data
console.log({ __type: 'splunk', ...data });
// Or use Tail Worker to forward to Splunk
```

### From Cloudflare to Fastly

```javascript
// Cloudflare structured logging
console.log({ user_id: 123, action: 'click' });

// Fastly equivalent
console.log(JSON.stringify({ user_id: 123, action: 'click' }));
// Or use Logger for external endpoints
const logger = new Logger('analytics');
logger.log(JSON.stringify({ user_id: 123, action: 'click' }));
```

---

## References

### Fastly Compute Documentation

- Console API: https://js-compute-reference-docs.edgecompute.app/docs/globals/console/
- Logger Class: https://js-compute-reference-docs.edgecompute.app/docs/fastly:logger/Logger/
- Logger.log(): https://js-compute-reference-docs.edgecompute.app/docs/fastly:logger/Logger/prototype/log
- Testing & Debugging: https://developer.fastly.com/learning/compute/testing/
- Logging Integrations: https://www.fastly.com/documentation/guides/integrations/logging/

### Cloudflare Workers Documentation

- Console API: https://developers.cloudflare.com/workers/runtime-apis/console/
- Workers Logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Logpush: https://developers.cloudflare.com/workers/observability/logs/logpush/
- Tail Workers: https://developers.cloudflare.com/workers/observability/logs/tail-workers/
- Real-time Logs: https://developers.cloudflare.com/workers/observability/logs/real-time-logs/
- Enable Destinations: https://developers.cloudflare.com/logs/logpush/logpush-job/enable-destinations/

---

## Summary

Both Fastly Compute and Cloudflare Workers provide robust logging capabilities, but with different approaches:

- **Console API**: Both platforms support standard `console.log()`, `console.error()`, etc., with minor differences in advanced methods
- **External Logging**: Fastly uses the `Logger` class for direct endpoint integration; Cloudflare uses Logpush and Tail Workers
- **Structured Logging**: Cloudflare auto-indexes JSON objects; Fastly requires manual JSON serialization
- **Log Viewing**: Both support CLI tailing (`fastly log-tail` vs `wrangler tail`)

The unified adapter patterns provided enable consistent logging behavior across both platforms while leveraging platform-specific optimizations.

---

## Implementation Recommendations

Based on the helix-universal adapter pattern (see [PR #426](https://github.com/adobe/helix-universal/pull/426)), here are recommendations for implementing logging in an edge deployment plugin:

### Edge Wrapper Implementation

✅ **Edge Wrapper** - Built into the core adapter:

1. **Unified Logger (context.log)** - Similar to helix-universal's `context.log`
   - Provide `context.log` compatible with [@adobe/helix-log](https://github.com/adobe/helix-log)
   - Methods: `log()`, `fatal()`, `error()`, `warn()`, `info()`, `debug()`, `verbose()`, `silly()`, `trace()`
   - **Rationale**: All functions need logging; consistent interface across platforms
   - **Example**: `context.log.info('Processing request', { url: request.url })`

2. **Automatic Context Enrichment**
   - Add invocation metadata to all log entries (requestId, function name, version)
   - Add platform information (runtime, region)
   - **Rationale**: Essential for debugging and tracing
   - **Example**: Logs automatically include `{ invocationId, funcName, runtime }`

3. **Console API Normalization**
   - Wrap `console.log/error/warn` to ensure consistent behavior
   - Handle structured logging differences (JSON auto-indexing on Cloudflare)
   - **Rationale**: Transparent console.log usage for developers

### Plugin Implementation

🔌 **Plugin** - Optional, composable features:

1. **Structured Logging Plugin** - `@adobe/helix-edge-structured-logging`
   - Enhanced structured logging with fields/formatters
   - Log level filtering
   - Performance metrics tracking
   - **Example**:
     ```javascript
     export const handler = edge
       .with(structuredLoggingPlugin, { level: 'info', fields: { service: 'api' } })
       .wrap(async (request, context) => {
         context.log.info('Request received', { method: request.method });
       });
     ```

2. **External Logging Plugin** - `@adobe/helix-edge-external-logging`
   - Send logs to external endpoints (Datadog, Splunk, etc.)
   - Buffer and batch log entries for efficiency
   - **Rationale**: Not all functions need external logging; opt-in
   - **Example**: `@adobe/helix-edge-datadog`, `@adobe/helix-edge-splunk`

3. **Error Tracking Plugin** - `@adobe/helix-edge-error-tracking`
   - Integration with error tracking services (Sentry, Bugsnag)
   - Automatic error capture and enrichment
   - **Example**:
     ```javascript
     export const handler = edge
       .with(errorTrackingPlugin, { sentryDsn: process.env.SENTRY_DSN })
       .wrap(async (request, context) => {
         // Errors automatically captured
       });
     ```

### Import/Polyfill Implementation

📦 **Import** - Library-based functionality:

1. **@adobe/helix-log** - Import directly
   - Full-featured logging library
   - Used as the basis for `context.log`
   - **Example**: `import { SimpleInterface } from '@adobe/helix-log'`

2. **Log Formatters** - Standard libraries
   - JSON formatting, pretty printing
   - **Example**: `pino`, `winston` (if needed)

3. **APM Integration** - Application-specific
   - New Relic, Datadog APM agents
   - **Example**: Import and initialize in function code

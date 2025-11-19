# Experimental and Additional Platform-Specific APIs: Fastly Compute vs Cloudflare Workers

This document analyzes experimental features, Node.js compatibility, platform-specific capabilities, and additional APIs unique to each edge computing platform.

## Executive Summary

Both Fastly Compute and Cloudflare Workers provide platform-specific experimental APIs that extend beyond standard web APIs. Fastly focuses on backend management and build-time optimizations (`fastly:experimental`), while Cloudflare emphasizes Node.js compatibility, service-to-service RPC communication, AI/ML inference, and stateful computing through Durable Objects. These APIs represent areas where cross-platform abstraction may be challenging or require platform-specific code paths.

---

## Fastly Experimental APIs

### fastly:experimental - allowDynamicBackends

| Property | Details |
|----------|---------|
| **Platform** | Fastly Compute only |
| **Module** | `fastly:experimental` |
| **Purpose** | Control security policy for dynamic backend creation |
| **Status** | **DEPRECATED** - Use `enforceExplicitBackends` instead |

#### Function Signature
```javascript
import { allowDynamicBackends } from 'fastly:experimental';

allowDynamicBackends(enabled);
```

**Parameters:**
- `enabled` (boolean): Whether to permit dynamic backends

**Returns:** `undefined`

#### Usage Context
This deprecated function controlled whether third-party JavaScript could send requests to arbitrary destinations. By invoking `allowDynamicBackends(false)`, developers could restrict requests to explicitly defined backends, protecting against potential data exfiltration.

**Recommended Alternative:**
```javascript
import { enforceExplicitBackends } from 'fastly:backend';

enforceExplicitBackends(defaultBackend?);
```

#### Cross-Platform Alternative
**None** - Cloudflare Workers has no equivalent concept. All fetch requests in Workers can target any URL without explicit backend definitions.

**Documentation:** https://js-compute-reference-docs.edgecompute.app/docs/fastly:experimental/allowDynamicBackends

---

### fastly:experimental - includeBytes

| Property | Details |
|----------|---------|
| **Platform** | Fastly Compute only |
| **Module** | `fastly:experimental` |
| **Purpose** | Embed static files as binary data at build time |
| **Availability** | Build-time initialization only |

#### Function Signature
```javascript
import { includeBytes } from 'fastly:experimental';

const fileData = includeBytes('path/to/file.txt');
```

**Parameters:**
- `path` (string): File path relative to application root directory

**Returns:** `Uint8Array` containing file contents

#### Usage Example
```javascript
import { includeBytes } from 'fastly:experimental';

// Must be called during build-time initialization
const readme = includeBytes('README.md');

addEventListener('fetch', (event) => {
  event.respondWith(new Response(readme, {
    headers: { 'Content-Type': 'text/plain' }
  }));
});
```

#### Key Constraints
- **Build-time only**: Cannot be invoked during request handling
- **Static embedding**: File contents become part of compiled WASM binary
- **No runtime file system**: Fastly Compute has no file system access

#### Cross-Platform Alternative
**Cloudflare Workers:**
```javascript
// Import static assets via bundler (Wrangler/esbuild)
import readmeText from './README.md';

// Or use KV for dynamic assets
const data = await env.ASSETS.get('readme.md', { type: 'arrayBuffer' });
```

Cloudflare relies on bundler imports or KV/R2 storage rather than build-time byte embedding.

**Documentation:** https://js-compute-reference-docs.edgecompute.app/docs/fastly:experimental/includeBytes

---

### fastly:backend - enforceExplicitBackends

| Property | Details |
|----------|---------|
| **Platform** | Fastly Compute only |
| **Module** | `fastly:backend` |
| **Purpose** | Restrict backend usage for security |
| **Availability** | Runtime configuration |

#### Function Signature
```javascript
import { enforceExplicitBackends } from 'fastly:backend';

enforceExplicitBackends(defaultBackend?);
```

**Parameters:**
- `defaultBackend` (string, optional): Backend name for fetch requests without explicit backend

**Returns:** `undefined`

#### Security Benefits
- Prevents third-party code from making requests to arbitrary destinations
- Mitigates data exfiltration risks
- Works independently of service-level dynamic backend configuration

#### Cross-Platform Alternative
**None** - Cloudflare Workers does not have an equivalent security control for outbound requests.

**Documentation:** https://js-compute-reference-docs.edgecompute.app/docs/fastly:backend/enforceExplicitBackends

---

## Cloudflare Node.js Compatibility

### Node.js Compatibility Mode

| Property | Details |
|----------|---------|
| **Platform** | Cloudflare Workers only |
| **Access** | Compatibility flag in wrangler.toml |
| **Purpose** | Enable Node.js API access in Workers |
| **Availability** | GA with compatibility date >= 2024-09-23 |

#### Enabling Node.js Compatibility
```toml
# wrangler.toml
compatibility_flags = [ "nodejs_compat" ]
compatibility_date = "2024-09-23"
```

**Minimal option (AsyncLocalStorage only):**
```toml
compatibility_flags = [ "nodejs_als" ]
```

#### Fully Supported Node.js Modules
- **Buffer**: Binary data handling
- **Crypto**: Cryptographic operations
- **DNS**: DNS resolution
- **Events**: EventEmitter pattern
- **File system (fs)**: Limited file operations
- **HTTP/HTTPS**: HTTP client/server APIs
- **Net**: Network socket APIs
- **Path**: File path utilities
- **Process**: Process information
- **Streams**: Readable/Writable streams
- **Timers**: setTimeout, setInterval
- **URL**: URL parsing and manipulation
- **Utilities (util)**: Debugging and utility functions
- **Zlib**: Compression/decompression

#### Partially Supported Modules
- **Console**: Basic logging (limited features)
- **Module**: Module system utilities
- **OS**: Operating system information (limited)
- **Performance hooks**: Timing and performance
- **TLS/SSL**: Secure connections

#### Non-Functional Stubs (Import Compatibility Only)
- **Async hooks**: Context tracking
- **Child processes**: Process spawning
- **Cluster**: Multi-process management
- **HTTP/2**: HTTP/2 protocol
- **Readline**: Interactive input
- **VM**: JavaScript virtualization

These stubs allow npm packages to import the modules but will throw errors if methods are called.

#### Unsupported Modules
- SQLite
- Test runner

#### Polyfill Behavior
Wrangler uses the **unenv** library to inject polyfills. Non-implemented methods throw:
```
"[unenv] <method name> is not implemented yet!"
```

#### Cross-Platform Alternative
**Fastly Compute**: No Node.js compatibility layer. Must use Web APIs or Fastly-specific modules.

**Documentation:** https://developers.cloudflare.com/workers/runtime-apis/nodejs/

---

### AsyncLocalStorage

| Property | Details |
|----------|---------|
| **Platform** | Cloudflare Workers only |
| **Module** | `node:async_hooks` |
| **Purpose** | Maintain context across async operations |
| **Availability** | Requires `nodejs_compat` flag |

#### Core API
```javascript
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export default {
  async fetch(request, env) {
    return als.run({ requestId: crypto.randomUUID() }, async () => {
      // Store accessible throughout async operations
      const store = als.getStore();
      console.log(`Request ID: ${store.requestId}`);
      return new Response('OK');
    });
  }
};
```

#### Available Methods
- `getStore()`: Returns current store value
- `run(store, callback, ...args)`: Execute function with context
- `exit(callback, ...args)`: Execute outside any context

#### Static Methods
- `AsyncLocalStorage.bind(fn)`: Capture current context
- `AsyncLocalStorage.snapshot()`: Snapshot context for later

#### Limitations
- No `enterWith()` or `disable()` methods
- Limited support for thenables (non-Promise objects)
- No full `async_hooks` API

#### Cross-Platform Alternative
**Fastly Compute**: No equivalent. Must pass context explicitly through function parameters.

**Documentation:** https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/

---

## Cloudflare RPC (Remote Procedure Calls)

### Service Bindings with RPC

| Property | Details |
|----------|---------|
| **Platform** | Cloudflare Workers only |
| **Purpose** | Direct Worker-to-Worker communication |
| **Availability** | Compatibility date >= 2024-04-03 |

#### Core Concept
RPC enables calling methods on other Workers as if they were local JavaScript functions.

#### Worker B (Service Provider)
```javascript
export default {
  add(a, b) {
    return a + b;
  },

  async getUserData(userId) {
    // Can be async
    return { id: userId, name: 'Example' };
  }
};
```

#### Worker A (Service Consumer)
```javascript
export default {
  async fetch(request, env) {
    // Call Worker B's method via service binding
    const result = await env.WORKER_B.add(1, 2);
    return new Response(`Result: ${result}`);
  }
};
```

#### Supported Data Types
- All Structured Cloneable types
- **Functions**: Automatically converted to stubs
- **Classes extending RpcTarget**: Custom class instances
- **ReadableStream/WritableStream**: With automatic flow control
- **Request/Response**: HTTP objects

#### Promise Pipelining
```javascript
// Chain calls without awaiting intermediate results
const result = await env.WORKER_B.getData().transform().validate();
```

This reduces network round trips by speculating on eventual results.

#### Configuration (wrangler.toml)
```toml
[[services]]
binding = "WORKER_B"
service = "my-other-worker"
```

#### Limitations
- Maximum serialized message size: 32 MiB
- Smart Placement ignored during RPC
- Classes must extend `RpcTarget`

#### Cross-Platform Alternative
**Fastly Compute**: No equivalent. Inter-service communication requires HTTP fetch requests.

**Documentation:** https://developers.cloudflare.com/workers/runtime-apis/rpc/

---

## Cloudflare Context API

### ExecutionContext Methods

| Property | Details |
|----------|---------|
| **Platform** | Cloudflare Workers only |
| **Purpose** | Lifecycle management and background tasks |
| **Access** | Third parameter in fetch handler |

#### Accessing Context
```javascript
export default {
  async fetch(request, env, ctx) {
    // ctx is the ExecutionContext
  }
};
```

#### ctx.waitUntil(promise)
Extends Worker lifetime for background work after returning response.

```javascript
export default {
  async fetch(request, env, ctx) {
    // Send analytics asynchronously
    ctx.waitUntil(sendAnalytics(request));

    // Return response immediately
    return new Response('OK');
  }
};

async function sendAnalytics(request) {
  await fetch('https://analytics.example.com', {
    method: 'POST',
    body: JSON.stringify({ url: request.url })
  });
}
```

**Key Features:**
- Multiple `waitUntil()` calls supported
- Rejected promises don't prevent other queued work
- Useful for logging, caching, analytics

#### ctx.passThroughOnException()
Implements "fail open" behavior for graceful degradation.

```javascript
export default {
  async fetch(request, env, ctx) {
    ctx.passThroughOnException();

    // If this throws, request forwards to origin
    return processRequest(request);
  }
};
```

#### ctx.props
Pass configuration from caller (Service Bindings).

```javascript
// Trusted configuration from parent Worker
const config = ctx.props;
```

#### Cross-Platform Alternative
**Fastly Compute:**
```javascript
// Fastly uses FetchEvent.waitUntil()
addEventListener('fetch', (event) => {
  event.waitUntil(doBackgroundWork());
  event.respondWith(new Response('OK'));
});
```

Note: Fastly has no equivalent to `passThroughOnException()`.

**Documentation:** https://developers.cloudflare.com/workers/runtime-apis/context/

---

## Cloudflare AI Integration

### Workers AI

| Property | Details |
|----------|---------|
| **Platform** | Cloudflare Workers only |
| **Purpose** | ML model inference at the edge |
| **Availability** | Free and Paid plans |

#### Overview
- 50+ open-source models available
- Serverless GPU infrastructure
- Pay-for-what-you-use pricing

#### Model Categories
- Text generation (LLMs)
- Image classification
- Object detection
- Text embeddings
- Speech recognition
- Translation

#### Basic Usage
```javascript
export default {
  async fetch(request, env) {
    const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: 'What is the capital of France?'
    });

    return new Response(JSON.stringify(response));
  }
};
```

#### Configuration
```toml
# wrangler.toml
[[ai]]
binding = "AI"
```

#### Cross-Platform Alternative
**Fastly Compute**: No native AI inference. Must call external AI APIs via HTTP fetch.

**Documentation:** https://developers.cloudflare.com/workers-ai/

---

## Cloudflare Durable Objects

### Stateful Edge Computing

| Property | Details |
|----------|---------|
| **Platform** | Cloudflare Workers only |
| **Purpose** | Persistent stateful objects at the edge |
| **Availability** | Paid plans |

#### Core Concept
Durable Objects provide single-instance coordination and persistent storage for stateful applications.

#### Use Cases
- Real-time collaboration
- Game state management
- Rate limiting with global consistency
- WebSocket session management
- Distributed locks

#### Basic Structure
```javascript
export class Counter {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    let value = await this.state.storage.get('count') || 0;
    value++;
    await this.state.storage.put('count', value);
    return new Response(`Count: ${value}`);
  }
}
```

#### Accessing from Worker
```javascript
export default {
  async fetch(request, env) {
    const id = env.COUNTER.idFromName('my-counter');
    const stub = env.COUNTER.get(id);
    return stub.fetch(request);
  }
};
```

#### Storage Options
- **SQLite-backed** (modern): Efficient persistence
- **KV-backed** (legacy): Backward compatibility

#### Advanced Features
- **Alarms**: Scheduled execution within objects
- **WebGPU**: GPU acceleration
- **Rust bindings**: Full Rust support

#### Cross-Platform Alternative
**Fastly Compute**: No equivalent. Stateful coordination requires external services (Redis, databases).

**Documentation:** https://developers.cloudflare.com/workers/runtime-apis/durable-objects/

---

## Performance and Timing APIs

### Performance.now() Comparison

| Feature | Fastly Compute | Cloudflare Workers |
|---------|----------------|-------------------|
| **API** | `performance.now()` | `performance.now()` |
| **Base** | Standard Web API | Standard Web API |
| **Resolution** | High resolution | Limited in production |
| **Security** | Standard behavior | Spectre mitigation |

#### Cloudflare Specific Behavior

```javascript
const start = performance.now();
// CPU-intensive work without I/O
const end = performance.now();

// In production: end - start may be 0
// In local dev: normal timing behavior
```

**Key Limitation:** In production, timers only advance after I/O operations (Spectre attack mitigation). CPU-only loops show zero elapsed time.

**When to Use:**
- Measuring I/O operations (fetches, KV reads) works correctly
- Local development with Wrangler provides accurate CPU timing
- Avoid relying on timing for CPU-bound operations in production

#### Cross-Platform Considerations
Both platforms support `performance.now()`, but Cloudflare's security restrictions mean timing behavior differs significantly in production.

**Documentation:**
- Fastly: Standard Web Performance API
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/performance/

---

### setTimeout/setInterval

| Feature | Fastly Compute | Cloudflare Workers |
|---------|----------------|-------------------|
| **setTimeout** | Supported | Supported |
| **setInterval** | Supported | Supported |
| **clearTimeout** | Supported | Supported |
| **clearInterval** | Supported | Supported |

Both platforms support standard timer APIs with similar behavior.

```javascript
// Works on both platforms
const timeoutId = setTimeout(() => {
  console.log('Delayed execution');
}, 1000);

clearTimeout(timeoutId);
```

---

## WebAssembly Support

### WebAssembly Comparison

| Feature | Fastly Compute | Cloudflare Workers |
|---------|----------------|-------------------|
| **Core Support** | Native (WASM-based runtime) | `WebAssembly.instantiate()` |
| **SIMD** | Supported | Fully supported |
| **Threading** | Not supported | Not supported |
| **WASI** | Limited | Experimental |
| **Languages** | Rust, C, C++, AssemblyScript | Rust, Go, C, C++ |

#### Cloudflare WebAssembly Usage
```javascript
import wasmModule from './module.wasm';

export default {
  async fetch(request) {
    const instance = await WebAssembly.instantiate(wasmModule);
    const result = instance.exports.compute(42);
    return new Response(`Result: ${result}`);
  }
};
```

#### Key Considerations
- **Binary Size**: WASM modules increase Worker size
- **Startup Time**: Larger binaries may have slower cold starts
- **Optimization**: Use `wasm-opt` to reduce binary size
- **No Threading**: Single-threaded execution only

**Documentation:** https://developers.cloudflare.com/workers/runtime-apis/webassembly/

---

## HTMLRewriter (Both Platforms)

### HTML Transformation API

| Property | Details |
|----------|---------|
| **Fastly** | `fastly:html-rewriter` module |
| **Cloudflare** | Native `HTMLRewriter` class |
| **Purpose** | Stream-based HTML transformation |

Both platforms provide similar HTML rewriting capabilities:

#### Cloudflare Example
```javascript
export default {
  async fetch(request) {
    const response = await fetch(request);

    return new HTMLRewriter()
      .on('a', {
        element(element) {
          element.setAttribute('target', '_blank');
        }
      })
      .transform(response);
  }
};
```

#### Common Features
- jQuery-like selectors
- Element manipulation (`setAttribute`, `append`, `prepend`, `replace`)
- Text content handling
- Document-level handlers
- Async handler support

#### Selector Support
- Basic: `*`, `E`, `E.class`, `E#id`
- Pseudo-classes: `:nth-child()`, `:first-child`, `:not()`
- Attribute matching: `[foo="bar"]`, `[foo^="bar"]`
- Combinators: `E F`, `E > F`

This is one of the few advanced APIs with similar implementations on both platforms.

**Documentation:**
- Fastly: `fastly:html-rewriter` module
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/

---

## Compatibility Dates and Flags

### Cloudflare Compatibility System

| Property | Details |
|----------|---------|
| **Platform** | Cloudflare Workers only |
| **Purpose** | Opt-in to breaking changes and new features |

#### Configuration
```toml
# wrangler.toml
compatibility_date = "2024-09-23"
compatibility_flags = [ "nodejs_compat" ]
```

**Key Behavior:**
- Backwards compatibility maintained indefinitely
- New features may require current dates
- Protects deployed Workers from breaking changes

#### Common Compatibility Flags
- `nodejs_compat`: Enable Node.js APIs
- `nodejs_als`: Enable only AsyncLocalStorage
- `enable_ctx_exports`: Enable context exports

#### Cross-Platform Alternative
**Fastly Compute**: Uses SDK versioning and service configuration rather than compatibility dates.

**Documentation:** https://developers.cloudflare.com/workers/configuration/compatibility-dates/

---

## Streams API

### Streaming Comparison

| Feature | Fastly Compute | Cloudflare Workers |
|---------|----------------|-------------------|
| **ReadableStream** | Standard Web API | Standard Web API |
| **WritableStream** | Standard Web API | Standard Web API |
| **TransformStream** | Standard Web API | Standard Web API |
| **Context** | FetchEvent | Request context only |

Both platforms support standard Streams API for processing data without buffering.

#### Cloudflare-Specific Note
Streams API is only available inside the request context (fetch event listener callback).

```javascript
export default {
  async fetch(request) {
    const response = await fetch(request);

    // Transform stream without blocking
    const { readable, writable } = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk.toUpperCase());
      }
    });

    response.body.pipeTo(writable); // Don't await
    return new Response(readable);
  }
};
```

**Documentation:** https://developers.cloudflare.com/workers/runtime-apis/streams/

---

## Platform-Specific Feature Summary

### Fastly Compute Unique Features

1. **includeBytes()**: Build-time static file embedding
2. **enforceExplicitBackends()**: Security control for outbound requests
3. **Backend Class**: Explicit backend definitions with health checks
4. **Surrogate-Key purging**: Instant cache invalidation from Worker
5. **ACL lookup**: Native IP-based access control
6. **Edge Rate Limiter**: Built-in rate limiting with penalty box

### Cloudflare Workers Unique Features

1. **Node.js Compatibility**: 30+ Node.js modules
2. **AsyncLocalStorage**: Context across async operations
3. **RPC/Service Bindings**: Direct Worker-to-Worker calls
4. **Workers AI**: ML inference at edge
5. **Durable Objects**: Stateful computing
6. **ctx.waitUntil()**: Background task execution
7. **ctx.passThroughOnException()**: Graceful degradation
8. **Compatibility Dates**: Feature opt-in system
9. **Security Timer Restrictions**: Spectre mitigation

---

## Unification Recommendations

### 1. Node.js Compatibility
- **Strategy**: Feature detection with fallback
- **Implementation**: Use Web APIs as common baseline
- **Platform-specific**: Cloudflare can leverage Node.js modules when available

```javascript
// Unified approach
let crypto;
if (typeof require !== 'undefined') {
  crypto = require('node:crypto');
} else {
  crypto = globalThis.crypto; // Web Crypto API
}
```

### 2. Background Tasks
- **Unified Interface**:
```javascript
interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
}
```
- **Fastly**: Use `event.waitUntil()`
- **Cloudflare**: Use `ctx.waitUntil()`

### 3. Static Assets
- **Fastly**: Use `includeBytes()` at build time
- **Cloudflare**: Use bundler imports or KV/R2 storage
- **Unified**: Abstract asset loading with platform-specific implementations

### 4. Inter-Service Communication
- **Not Portable**: RPC is Cloudflare-specific
- **Alternative**: HTTP-based service communication works on both platforms
- **Recommendation**: Design for HTTP APIs when portability required

### 5. AI/ML Inference
- **Not Portable**: Workers AI is Cloudflare-only
- **Alternative**: External AI API calls via fetch
- **Recommendation**: Use external services for cross-platform compatibility

### 6. Stateful Computing
- **Not Portable**: Durable Objects are Cloudflare-only
- **Alternative**: External state management (Redis, databases)
- **Recommendation**: External services for cross-platform needs

### 7. Performance Timing
- **Common API**: `performance.now()` available on both
- **Caveat**: Be aware of Cloudflare's security restrictions
- **Recommendation**: Use for I/O timing only in production

### 8. HTMLRewriter
- **Most Portable**: Similar APIs on both platforms
- **Strategy**: Thin abstraction layer for import differences
- **Good candidate for unified API**

---

## Documentation Links

### Fastly Compute
- Experimental Module: https://js-compute-reference-docs.edgecompute.app/docs/fastly:experimental
- includeBytes: https://js-compute-reference-docs.edgecompute.app/docs/fastly:experimental/includeBytes
- allowDynamicBackends: https://js-compute-reference-docs.edgecompute.app/docs/fastly:experimental/allowDynamicBackends
- enforceExplicitBackends: https://js-compute-reference-docs.edgecompute.app/docs/fastly:backend/enforceExplicitBackends
- Backend Module: https://js-compute-reference-docs.edgecompute.app/docs/fastly:backend

### Cloudflare Workers
- Node.js Compatibility: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- AsyncLocalStorage: https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/
- RPC: https://developers.cloudflare.com/workers/runtime-apis/rpc/
- Context API: https://developers.cloudflare.com/workers/runtime-apis/context/
- Workers AI: https://developers.cloudflare.com/workers-ai/
- Durable Objects: https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
- Performance: https://developers.cloudflare.com/workers/runtime-apis/performance/
- WebAssembly: https://developers.cloudflare.com/workers/runtime-apis/webassembly/
- HTMLRewriter: https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/
- Compatibility Dates: https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- Streams: https://developers.cloudflare.com/workers/runtime-apis/streams/
- Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/

---

## Implementation Recommendations

Based on the helix-universal adapter pattern (see [PR #426](https://github.com/adobe/helix-universal/pull/426)):

### Edge Wrapper Implementation

✅ **Edge Wrapper** - Standard Web APIs:
- **Performance API** - Use platform native when available
- **WebAssembly** - Use platform native
- **Rationale**: Standard Web Platform APIs

### Plugin Implementation

🔌 **Plugin** - Experimental and platform-specific:

1. **AI/ML Integration** - `@adobe/helix-edge-ai` (Cloudflare-only)
   - Workers AI integration
   - **Rationale**: Cloudflare-specific feature
   - **Example**: Conditional plugin that's skipped on Fastly

2. **Durable Objects** - `@adobe/helix-edge-durable` (Cloudflare-only)
   - Coordination and state management
   - **Rationale**: Unique to Cloudflare, no Fastly equivalent

3. **RPC/Service Bindings** - `@adobe/helix-edge-rpc`
   - Inter-function communication
   - **Rationale**: Platform-specific patterns

### Import/Polyfill Implementation

📦 **Import** - Application-level:
- **@tensorflow/tfjs** for ML inference
- **onnxruntime-web** for WASM-based ML
- Custom WASM modules for specialized processing

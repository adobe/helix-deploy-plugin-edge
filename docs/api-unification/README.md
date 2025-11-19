# Edge Platform API Unification

A comprehensive analysis and unification strategy for creating cross-platform adapters between **Fastly Compute** and **Cloudflare Workers** edge computing platforms.

## Purpose

This documentation suite provides:

1. **Detailed API comparisons** between Fastly Compute and Cloudflare Workers
2. **Compatibility matrices** for each feature area
3. **Unified adapter patterns** with production-ready code examples
4. **Implementation recommendations** for each API area (Edge Wrapper vs Plugin vs Import)
5. **Migration strategies** for moving between platforms
6. **Best practices** for writing portable edge code

## Implementation Strategy

Each API document includes **Implementation Recommendations** based on the [helix-universal adapter pattern](https://github.com/adobe/helix-universal/pull/426), categorizing functionality into three layers:

### Core Principle: Only Unify What Exists on Both Platforms

**Platform-specific features should NOT be wrapped or abstracted** - use native APIs directly:
- ❌ Don't wrap: Cloudflare HTMLRewriter, Durable Objects, R2, Workers AI
- ❌ Don't wrap: Fastly EdgeRateLimiter, PenaltyBox, Fanout
- ✅ Instead: Use feature detection and native APIs, or external alternatives for cross-platform needs

Only unify APIs that exist on **both** platforms with different implementations.

### ✅ Edge Wrapper (Core Adapter)
Built-in functionality that all edge functions need **and exists on both platforms**:
- Handler pattern normalization (Fastly ↔ Cloudflare)
- Unified `context` object (similar to helix-universal's UniversalContext)
- Environment variables and secrets (`context.env`)
- Logging infrastructure (`context.log`)
- Runtime metadata (`context.runtime`, `context.invocation`)
- Backend/origin routing (Fastly explicit vs Cloudflare implicit)

### 🔌 Plugin (Optional, Composable)
Features that **exist on both platforms** but can be composed via middleware:
- Cache management (SimpleCache vs Cache API)
- Geolocation normalization (event.client.geo vs request.cf)
- Body parsing (available on both, different patterns)
- Security headers (both support, but application-specific)

**NOT for platform-specific features** - those should use native APIs.

**Example:**
```javascript
import { edge } from '@adobe/helix-deploy-plugin-edge';
import geoPlugin from '@adobe/helix-edge-geo';
import cachePlugin from '@adobe/helix-edge-cache';

export const handler = edge
  .with(geoPlugin)
  .with(cachePlugin, { ttl: 3600 })
  .wrap(async (request, context) => {
    // context.geo, context.cache available
    return new Response(`Hello from ${context.geo.countryCode}`);
  });
```

### 📦 Import/Polyfill (Libraries)
Application-level concerns that should be imported:
- Standard Web APIs (already compatible, no wrapper needed)
- Storage clients (@adobe/helix-shared-storage)
- Third-party libraries (htmlparser2, ua-parser-js, jose)
- Polyfills for Web Standards missing on one platform

### ❌ Use Native APIs (Platform-Specific)

For features that only exist on one platform, **use the native API directly** with feature detection:

```javascript
export async function main(request, context) {
  // Use Cloudflare HTMLRewriter natively
  if (typeof HTMLRewriter !== 'undefined') {
    return new HTMLRewriter()
      .on('head', {
        element(el) {
          el.append('<script src="/analytics.js"></script>', { html: true });
        }
      })
      .transform(await fetch(request));
  }

  // Use Fastly EdgeRateLimiter natively
  if (context.runtime.name === 'fastly') {
    const { EdgeRateLimiter } = await import('fastly:edge-rate-limiter');
    const limiter = new EdgeRateLimiter({ /* ... */ });
    // ... use native API
  }

  // For cross-platform needs, use external services
  if (needsRateLimiting) {
    // Use external rate limiting service (Redis, Upstash, etc.)
    await externalRateLimiter.check(clientIP);
  }
}
```

**Don't create plugins or wrappers for:**
- Cloudflare: HTMLRewriter, Durable Objects, R2, Workers AI, WebSocketPair
- Fastly: EdgeRateLimiter, PenaltyBox, Fanout, CacheOverride callbacks

## Document Index

Each document includes platform comparisons, unification strategies, and **implementation recommendations** (Wrapper/Plugin/Import).

| Document | Description | Key APIs Covered | Implementation Focus |
|----------|-------------|------------------|---------------------|
| [**Request/Response/Fetch**](./request-response.md) | Core HTTP primitives and handler patterns | Request, Response, Fetch, Headers, FetchEvent | ✅ Wrapper: Handler normalization, backend routing<br>🔌 Plugin: Cache control (both platforms) |
| [**Cache & Storage**](./cache-storage.md) | Caching and persistent storage APIs | SimpleCache, KVStore, Workers KV, R2, Durable Objects | ✅ Wrapper: Storage bindings, secrets<br>🔌 Plugin: KV (both), Cache (both)<br>❌ Native: R2, Durable Objects |
| [**HTML Rewriter**](./html-rewriter.md) | Streaming HTML transformation | HTMLRewriter, DOM manipulation, content injection | ❌ Native: Use Cloudflare HTMLRewriter directly<br>📦 Polyfill: htmlparser2 on Fastly if needed |
| [**Cryptography & Encoding**](./crypto-encoding.md) | Web Crypto API and data encoding | SubtleCrypto, TextEncoder/Decoder, atob/btoa | ✅ No wrapper needed (Web Standard)<br>📦 Import: JWT libraries, additional algorithms |
| [**WebSocket & Streaming**](./websocket-streaming.md) | Real-time communication and streams | WebSocketPair, Fanout, ReadableStream, TransformStream | ✅ Wrapper: Standard streams<br>❌ Native: WebSocketPair (CF), Fanout (Fastly) |
| [**Logging**](./logging.md) | Console and structured logging | Console API, log endpoints, observability | ✅ Wrapper: context.log (helix-log)<br>🔌 Plugin: External log shipping (both) |
| [**Security & Rate Limiting**](./security-ratelimit.md) | Access control and throttling | EdgeRateLimiter, PenaltyBox, cache purging | ❌ Native: EdgeRateLimiter (Fastly), CF Rate Limiting<br>🔌 Plugin: Security headers (both) |
| [**Environment & Geolocation**](./environment-geo.md) | Runtime environment and geo data | Client metadata, geo lookup, environment variables | ✅ Wrapper: context.env, runtime info<br>🔌 Plugin: Geo normalization (both platforms) |
| [**Experimental/Additional**](./experimental-additional.md) | Platform-specific and experimental features | Device detection, bot management, advanced features | ✅ Wrapper: Standard Web APIs<br>❌ Native: Workers AI, Durable Objects (CF only) |

## Platform Overview

### Fastly Compute
- **Runtime**: JavaScript/WASM on Fastly's edge network
- **Handler Pattern**: Service Worker style (`addEventListener('fetch', ...)`)
- **Storage**: KVStore, ConfigStore, SecretStore
- **Unique Features**: Backend routing, VCL-style caching, global purge, edge rate limiting

### Cloudflare Workers
- **Runtime**: JavaScript on Cloudflare's V8 isolates
- **Handler Pattern**: Module exports (`export default { fetch }`)
- **Storage**: Workers KV, R2, Durable Objects, D1
- **Unique Features**: HTMLRewriter, Durable Objects, WebSocket handling, image optimization

## Compatibility Summary

### High Compatibility (Minimal Adaptation)
- ✅ Request/Response APIs (Web Standard)
- ✅ Headers API
- ✅ TextEncoder/TextDecoder
- ✅ Web Crypto API (core methods)
- ✅ Console API
- ✅ ReadableStream/WritableStream
- ✅ URL/URLSearchParams

### Moderate Compatibility (Adapter Required)
- ⚠️ Fetch API (backend routing differences)
- ⚠️ KV Storage (API shape similar, features differ)
- ⚠️ Cache APIs (different semantics)
- ⚠️ Geolocation data (property naming differs)
- ⚠️ Handler/Event patterns
- ⚠️ Environment/Config access

### Low Compatibility (Platform-Specific)
- ❌ Fastly: Backend class, EdgeRateLimiter, PenaltyBox, Fanout
- ❌ Cloudflare: HTMLRewriter, Durable Objects, R2, D1, WebSocket handling
- ❌ Fastly: CacheOverride, surrogate keys, VCL integration
- ❌ Cloudflare: Image optimization (cf.image), Bot Management

## Architecture Principles

### 1. Platform Detection
```javascript
// Runtime detection
const PLATFORM = (() => {
  if (typeof fastly !== 'undefined') return 'fastly';
  if (typeof HTMLRewriter !== 'undefined') return 'cloudflare';
  return 'unknown';
})();

const isPlatform = (p) => PLATFORM === p;
```

### 2. Unified Entry Points
```javascript
// Fastly adapter
addEventListener('fetch', (event) => {
  const ctx = new UnifiedContext(event);
  event.respondWith(unifiedHandler(event.request, {}, ctx));
});

// Cloudflare adapter
export default {
  async fetch(request, env, ctx) {
    const unifiedCtx = new UnifiedContext(ctx);
    return unifiedHandler(request, env, unifiedCtx);
  }
};
```

### 3. Feature Detection Over Platform Detection
```javascript
// Prefer feature detection
const hasHTMLRewriter = typeof HTMLRewriter !== 'undefined';
const hasDurableObjects = typeof DurableObject !== 'undefined';

if (hasHTMLRewriter) {
  // Use native HTMLRewriter
} else {
  // Use fallback implementation
}
```

### 4. Graceful Degradation
```javascript
class UnifiedStorage {
  getObjectStore() {
    if (!this.adapters.objects) {
      throw new Error('Object storage not available on this platform');
    }
    return this.adapters.objects;
  }
}
```

## Implementation Priority

### Phase 1: Core Infrastructure (High Priority)
1. **Request/Response wrappers** - Foundation for all HTTP handling
2. **Handler adapters** - Entry point normalization
3. **Fetch abstraction** - Backend routing unification
4. **Headers compatibility** - Standard across platforms

### Phase 2: Storage Layer (High Priority)
1. **KV Store adapter** - Cross-platform key-value storage
2. **Cache abstraction** - Unified caching semantics
3. **Config/Secrets access** - Environment configuration
4. **Session storage** - Request-scoped data

### Phase 3: Content Processing (Medium Priority)
1. **HTML transformation** - Unified HTMLRewriter interface
2. **Streaming transforms** - Body transformation pipelines
3. **Encoding utilities** - Text and binary encoding
4. **Crypto operations** - Hashing, signing, encryption

### Phase 4: Advanced Features (Medium Priority)
1. **Geolocation normalization** - Unified geo data access
2. **Logging infrastructure** - Structured logging
3. **Error handling** - Platform-specific error mapping
4. **Performance monitoring** - Timing and metrics

### Phase 5: Platform-Specific (Low Priority)
1. **Rate limiting** - Custom implementation for portability
2. **Real-time features** - WebSocket/streaming abstraction
3. **Advanced caching** - Surrogate keys, purge APIs
4. **Specialized storage** - R2, Durable Objects (Cloudflare-only)

## Quick Start

### 1. Unified Request Handler
```javascript
import { UnifiedContext, getRequestMetadata } from './adapters/context.js';

async function unifiedHandler(request, env, ctx, metadata) {
  // Platform-agnostic logic
  const url = new URL(request.url);
  const geo = metadata.geo;

  if (url.pathname === '/api/data') {
    return handleAPI(request, env, ctx);
  }

  return new Response('Hello from Edge!', {
    headers: { 'X-Edge-Location': geo.countryCode }
  });
}
```

### 2. Unified Fetch with Backend
```javascript
import { UnifiedBackendManager } from './adapters/backend.js';

const backends = new UnifiedBackendManager();
backends.register('api', {
  host: 'api.example.com',
  useSSL: true,
  connectTimeout: 5000
});

// In handler
const response = await backends.fetch('https://api.example.com/data', {
  backend: 'api'
});
```

### 3. Unified KV Storage
```javascript
import { UnifiedKVStore } from './adapters/storage.js';

const kv = new UnifiedKVStore(PLATFORM, storeOrBinding);
await kv.init();

// Platform-agnostic operations
await kv.put('user:123', JSON.stringify(userData));
const user = await kv.get('user:123', { type: 'json' });
await kv.delete('user:123');
```

### 4. Unified HTML Rewriter
```javascript
import { UnifiedHTMLRewriter } from './adapters/html-rewriter.js';

const response = await fetch(request);

return new UnifiedHTMLRewriter(PLATFORM)
  .on('head', {
    element(el) {
      el.append('<script src="/analytics.js"></script>', { html: true });
    }
  })
  .on('img', {
    element(el) {
      el.setAttribute('loading', 'lazy');
    }
  })
  .transform(response);
```

## Testing Strategy

### Multi-Platform Testing
```javascript
// test/unified-adapter.test.js
describe('UnifiedRequest', () => {
  ['fastly', 'cloudflare'].forEach(platform => {
    describe(`on ${platform}`, () => {
      beforeEach(() => {
        global.__PLATFORM__ = platform;
        setupPlatformMocks(platform);
      });

      it('should normalize cache key', () => {
        const req = new UnifiedRequest('https://example.com', {
          cacheKey: 'test-key'
        });
        // Assert platform-specific option is set correctly
      });
    });
  });
});
```

### Mock Implementations
```javascript
// mocks/fastly.js
global.fastly = {
  env: {
    get: (name) => process.env[name]
  }
};

// mocks/cloudflare.js
global.HTMLRewriter = class MockHTMLRewriter {
  on() { return this; }
  onDocument() { return this; }
  transform(response) { return response; }
};
```

## Migration Guide

### Fastly → Cloudflare

1. **Replace event listener with module export**
   ```javascript
   // Before (Fastly)
   addEventListener('fetch', (event) => {
     event.respondWith(handleRequest(event.request));
   });

   // After (Cloudflare)
   export default {
     async fetch(request, env, ctx) {
       return handleRequest(request);
     }
   };
   ```

2. **Update backend routing**
   ```javascript
   // Before (Fastly)
   fetch(url, { backend: 'origin' });

   // After (Cloudflare)
   fetch(url); // Backend determined by URL
   ```

3. **Replace geolocation access**
   ```javascript
   // Before (Fastly)
   const country = event.client.geo.country_code;

   // After (Cloudflare)
   const country = request.cf.country;
   ```

### Cloudflare → Fastly

1. **Replace module export with event listener**
2. **Add backend configuration** for all fetch calls
3. **Update storage bindings** to store names
4. **Replace HTMLRewriter** with streaming transformer
5. **Map cf properties** to event.client properties

## Performance Considerations

### Fastly Strengths
- Lower latency for VCL-integrated workloads
- Global cache purge capabilities
- Configurable backend timeouts
- Built-in rate limiting at edge

### Cloudflare Strengths
- HTMLRewriter performance (Rust-based)
- V8 isolate startup time
- Durable Objects for coordination
- Integrated image optimization

### Unified Adapter Overhead
- Platform detection: ~0.1ms
- Wrapper instantiation: ~0.1-0.5ms
- Feature translation: Varies by complexity
- Recommendation: Profile on both platforms

## Best Practices

1. **Use unified adapters** for maximum portability
2. **Feature-detect** rather than platform-detect when possible
3. **Test on both platforms** throughout development
4. **Document platform limitations** in your application
5. **Profile performance** to identify bottlenecks
6. **Version your adapters** separately from application code
7. **Consider external services** for features unavailable on both platforms
8. **Keep handlers thin** - business logic in platform-agnostic modules

## Contributing

When adding new API analysis:

1. Follow the existing document structure
2. Include platform-specific examples
3. Create comparison tables
4. Provide unified adapter code
5. Document limitations and edge cases
6. Add relevant links to official documentation
7. Update this README with new document

## Resources

### Official Documentation

**Fastly Compute**
- [JavaScript SDK Reference](https://js-compute-reference-docs.edgecompute.app/)
- [Fastly Compute Tutorial](https://developer.fastly.com/learning/compute/)
- [Fastly API Reference](https://developer.fastly.com/reference/api/)

**Cloudflare Workers**
- [Workers Runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/)
- [Workers Examples](https://developers.cloudflare.com/workers/examples/)
- [Workers Documentation](https://developers.cloudflare.com/workers/)

### Related Projects
- [WinterCG](https://wintercg.org/) - Web-interoperable Runtimes Community Group
- [Miniflare](https://miniflare.dev/) - Cloudflare Workers simulator
- [Viceroy](https://github.com/nickreese/viceroy) - Fastly Compute local testing

## License

This documentation is part of the helix-deploy-plugin-edge project. See the project root for license information.

---

*Last updated: 2025-11-17*

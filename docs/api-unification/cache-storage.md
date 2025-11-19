# Cache and Storage API Unification Strategy

This document analyzes the Cache and Storage APIs for Fastly Compute and Cloudflare Workers platforms, providing a comprehensive unification strategy for creating cross-platform adapters.

## Table of Contents

1. [Fastly APIs](#fastly-apis)
   - [fastly:cache](#fastlycache)
   - [fastly:cache-override](#fastlycache-override)
   - [fastly:kv-store](#fastlykv-store)
   - [fastly:config-store](#fastlyconfig-store)
   - [fastly:secret-store](#fastlysecret-store)
2. [Cloudflare APIs](#cloudflare-apis)
   - [Cache API](#cache-api)
   - [Workers KV](#workers-kv)
   - [R2](#r2)
   - [Durable Objects](#durable-objects)
3. [Cross-Platform Mapping](#cross-platform-mapping)
4. [Unified Adapter Patterns](#unified-adapter-patterns)

---

## Fastly APIs

### fastly:cache

**Purpose**: Provides caching functionality for storing and retrieving data at the edge with TTL-based expiration.

**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:cache/SimpleCache/

**Key Classes/Functions**:

- **SimpleCache** (static methods)
  - `SimpleCache.get(key: string): SimpleCacheEntry | null`
  - `SimpleCache.getOrSet(key: string, callback: () => Promise<{ value: any, ttl: number }>): Promise<any>`
  - `SimpleCache.purge(key: string, options?: { scope: 'global' }): void`

- **CoreCache** (low-level API)
  - `CoreCache.insert(key: string, options: InsertOptions): FastlyBody`
  - `CoreCache.transactionLookup(key: string): TransactionCacheEntry`

- **CacheEntry**
  - `.hits: number` - Cache hit count
  - `.body: ReadableStream`

**Cross-Platform Equivalent**: Cloudflare Cache API (partial)

**Unification Strategy**:
- SimpleCache.getOrSet maps conceptually to Cloudflare's `cache.match()` + `cache.put()` pattern
- TTL-based expiration aligns with Cache-Control headers in Cloudflare
- Global purge capability is unique to Fastly; Cloudflare requires zone-level purge API

**Code Example**:

```javascript
// Unified Cache Adapter
class UnifiedCache {
  constructor(platform) {
    this.platform = platform;
  }

  async getOrSet(key, fetchFn, ttl) {
    if (this.platform === 'fastly') {
      const { SimpleCache } = await import('fastly:cache');
      return SimpleCache.getOrSet(key, async () => ({
        value: await fetchFn(),
        ttl
      }));
    } else if (this.platform === 'cloudflare') {
      const cache = caches.default;
      const cacheKey = new Request(`https://cache.internal/${key}`);
      let response = await cache.match(cacheKey);

      if (!response) {
        const value = await fetchFn();
        response = new Response(JSON.stringify(value), {
          headers: { 'Cache-Control': `s-maxage=${ttl}` }
        });
        await cache.put(cacheKey, response.clone());
      }
      return response.json();
    }
  }

  async purge(key) {
    if (this.platform === 'fastly') {
      const { SimpleCache } = await import('fastly:cache');
      SimpleCache.purge(key, { scope: 'global' });
    } else if (this.platform === 'cloudflare') {
      const cache = caches.default;
      const cacheKey = new Request(`https://cache.internal/${key}`);
      await cache.delete(cacheKey);
    }
  }
}
```

---

### fastly:cache-override

**Purpose**: Configures caching behavior for fetch requests, allowing override of origin cache-control headers.

**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:cache-override/CacheOverride/

**Key Classes/Functions**:

- **CacheOverride**
  - Constructor: `new CacheOverride(mode?, init?)`
  - Modes: `"none"`, `"pass"`, `"override"`
  - Options:
    - `ttl: number` - Time to live in seconds
    - `swr: number` - Stale-while-revalidate in seconds
    - `surrogateKey: string` - For cache purging
    - `pci: boolean` - PCI/HIPAA compliant caching
    - `beforeSend: (request) => void` - Request modification hook
    - `afterSend: (response) => CacheOptions` - Response modification hook

**Cross-Platform Equivalent**: Cloudflare fetch() cf options / Cache-Control headers (partial)

**Unification Strategy**:
- Fastly's CacheOverride is more declarative; Cloudflare uses header manipulation
- `pass` mode maps to Cloudflare's `cacheEverything: false` or `cacheTtl: 0`
- `swr` (stale-while-revalidate) not directly supported in Cloudflare Cache API
- Surrogate keys are Fastly-specific; Cloudflare uses Cache-Tag headers

**Code Example**:

```javascript
// Unified Fetch with Cache Override
class UnifiedFetch {
  constructor(platform) {
    this.platform = platform;
  }

  async fetch(request, options = {}) {
    const { backend, ttl, swr, cacheMode = 'override' } = options;

    if (this.platform === 'fastly') {
      const { CacheOverride } = await import('fastly:cache-override');
      const cacheOverride = new CacheOverride(cacheMode, { ttl, swr });
      return fetch(request, { cacheOverride, backend });
    } else if (this.platform === 'cloudflare') {
      // Cloudflare cf options
      const cfOptions = {
        cacheTtl: ttl,
        cacheEverything: cacheMode !== 'pass'
      };

      // Note: swr not directly supported, would need custom implementation
      return fetch(request, { cf: cfOptions });
    }
  }
}
```

---

### fastly:kv-store

**Purpose**: Persistent, globally consistent key-value storage accessible during request processing.

**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:kv-store/KVStore/

**Key Classes/Functions**:

- **KVStore**
  - Constructor: `new KVStore(name: string)`
  - Methods:
    - `put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<void>`
    - `get(key: string): Promise<KVStoreEntry | null>`
    - `delete(key: string): Promise<void>`

- **KVStoreEntry**
  - `.text(): Promise<string>`
  - `.json(): Promise<any>`
  - `.arrayBuffer(): Promise<ArrayBuffer>`
  - `.body: ReadableStream`

**Cross-Platform Equivalent**: Cloudflare Workers KV

**Unification Strategy**:
- Both APIs are conceptually similar with key-value semantics
- Fastly requires store name at construction; Cloudflare uses bindings
- Return types differ: Fastly returns entry objects, Cloudflare returns values directly
- Cloudflare KV has metadata support; Fastly KV does not (use Config Store instead)

**Code Example**:

```javascript
// Unified KV Store Adapter
class UnifiedKVStore {
  constructor(platform, storeNameOrBinding) {
    this.platform = platform;
    this.store = storeNameOrBinding;
  }

  async init() {
    if (this.platform === 'fastly') {
      const { KVStore } = await import('fastly:kv-store');
      this.instance = new KVStore(this.store);
    } else if (this.platform === 'cloudflare') {
      // Binding is passed directly
      this.instance = this.store;
    }
  }

  async get(key, type = 'text') {
    if (this.platform === 'fastly') {
      const entry = await this.instance.get(key);
      if (!entry) return null;

      switch (type) {
        case 'json': return entry.json();
        case 'arrayBuffer': return entry.arrayBuffer();
        case 'stream': return entry.body;
        default: return entry.text();
      }
    } else if (this.platform === 'cloudflare') {
      return this.instance.get(key, type);
    }
  }

  async put(key, value, options = {}) {
    if (this.platform === 'fastly') {
      await this.instance.put(key, value);
    } else if (this.platform === 'cloudflare') {
      const { expiration, expirationTtl, metadata } = options;
      await this.instance.put(key, value, { expiration, expirationTtl, metadata });
    }
  }

  async delete(key) {
    await this.instance.delete(key);
  }

  async list(options = {}) {
    if (this.platform === 'fastly') {
      throw new Error('List operation not supported on Fastly KV Store');
    } else if (this.platform === 'cloudflare') {
      return this.instance.list(options);
    }
  }
}
```

---

### fastly:config-store

**Purpose**: Read-only configuration store for storing non-sensitive configuration data accessible at runtime.

**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:config-store/ConfigStore/

**Key Classes/Functions**:

- **ConfigStore**
  - Constructor: `new ConfigStore(name: string)`
  - Methods:
    - `get(key: string): string | null`

**Cross-Platform Equivalent**: Cloudflare Environment Variables / Workers KV (read-only pattern)

**Unification Strategy**:
- ConfigStore is synchronous and read-only; Cloudflare KV is async
- Best mapped to Cloudflare environment bindings for simple configs
- For larger configs, use read-only KV namespace pattern
- Note: Fastly Dictionary class is deprecated in favor of ConfigStore

**Code Example**:

```javascript
// Unified Config Store Adapter
class UnifiedConfigStore {
  constructor(platform, configSource) {
    this.platform = platform;
    this.source = configSource;
  }

  async init() {
    if (this.platform === 'fastly') {
      const { ConfigStore } = await import('fastly:config-store');
      this.instance = new ConfigStore(this.source);
    } else if (this.platform === 'cloudflare') {
      // configSource is either env object or KV binding
      this.instance = this.source;
    }
  }

  get(key) {
    if (this.platform === 'fastly') {
      return this.instance.get(key);
    } else if (this.platform === 'cloudflare') {
      // If using env vars directly
      if (typeof this.instance === 'object' && !this.instance.get) {
        return this.instance[key] || null;
      }
      // If using KV, this becomes async
      throw new Error('Use getAsync for Cloudflare KV-based config');
    }
  }

  async getAsync(key) {
    if (this.platform === 'fastly') {
      return this.instance.get(key);
    } else if (this.platform === 'cloudflare') {
      if (this.instance.get) {
        return this.instance.get(key);
      }
      return this.instance[key] || null;
    }
  }
}
```

---

### fastly:secret-store

**Purpose**: Secure storage for sensitive credentials and secrets, accessible at runtime.

**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:secret-store/SecretStore/prototype/get

**Key Classes/Functions**:

- **SecretStore**
  - Constructor: `new SecretStore(name: string)`
  - Methods:
    - `get(key: string): Promise<SecretStoreEntry | null>`

- **SecretStoreEntry**
  - `plaintext(): string`

**Cross-Platform Equivalent**: Cloudflare Workers Secrets (environment variables)

**Unification Strategy**:
- Fastly SecretStore is async and returns entry objects
- Cloudflare secrets are environment variables (sync access)
- Both provide secure storage but with different access patterns
- Fastly supports multiple secret stores; Cloudflare uses flat namespace

**Code Example**:

```javascript
// Unified Secret Store Adapter
class UnifiedSecretStore {
  constructor(platform, secretSource) {
    this.platform = platform;
    this.source = secretSource;
  }

  async init() {
    if (this.platform === 'fastly') {
      const { SecretStore } = await import('fastly:secret-store');
      this.instance = new SecretStore(this.source);
    } else if (this.platform === 'cloudflare') {
      // secretSource is the env object
      this.instance = this.source;
    }
  }

  async get(key) {
    if (this.platform === 'fastly') {
      const entry = await this.instance.get(key);
      return entry ? entry.plaintext() : null;
    } else if (this.platform === 'cloudflare') {
      // Cloudflare secrets are env vars
      return this.instance[key] || null;
    }
  }
}
```

---

## Cloudflare APIs

### Cache API

**Purpose**: Granular control over reading and writing from Cloudflare's global CDN cache.

**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/cache/

**Key Classes/Functions**:

- **caches.default** (global cache)
- **caches.open(name)** (custom cache instances)

- **Methods**:
  - `cache.put(request: Request | string, response: Response): Promise<undefined>`
  - `cache.match(request: Request | string, options?): Promise<Response | undefined>`
  - `cache.delete(request: Request | string, options?): Promise<boolean>`

- **Options**:
  - `ignoreMethod: boolean` - For match/delete

**Cross-Platform Equivalent**: Fastly SimpleCache / CoreCache (partial)

**Unification Strategy**:
- Cloudflare Cache uses Request/Response pairs; Fastly uses key-value semantics
- Cloudflare cache is data-center local; Fastly can be global
- Cache-Control headers control TTL in Cloudflare; Fastly uses explicit TTL options
- Neither supports stale-while-revalidate via Cache API directly

**Code Example**:

```javascript
// Cloudflare Cache API usage
export default {
  async fetch(request, env, ctx) {
    const cache = caches.default;
    const cacheKey = new Request(request.url, request);

    let response = await cache.match(cacheKey);

    if (!response) {
      response = await fetch(request);
      response = new Response(response.body, response);
      response.headers.set('Cache-Control', 's-maxage=3600');
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  }
};
```

---

### Workers KV

**Purpose**: Global, low-latency key-value data store for read-heavy workloads.

**Documentation**: https://developers.cloudflare.com/kv/api/

**Key Classes/Functions**:

- **KV Namespace Binding** (via env.NAMESPACE)
  - `get(key: string, type?: string | options?): Promise<string | object | ArrayBuffer | ReadableStream | null>`
  - `get(keys: string[], type?: string | options?): Promise<Map<string, value>>`
  - `getWithMetadata(key, type?): Promise<{ value, metadata }>`
  - `put(key: string, value: string | ReadableStream | ArrayBuffer, options?): Promise<void>`
  - `delete(key: string): Promise<void>`
  - `list(options?): Promise<{ keys, list_complete, cursor }>`

- **Options for put**:
  - `expiration: number` - Unix timestamp
  - `expirationTtl: number` - Seconds from now (min 60)
  - `metadata: object` - JSON-serializable (max 1KB)

- **Options for get**:
  - `type: 'text' | 'json' | 'arrayBuffer' | 'stream'`
  - `cacheTtl: number` - Edge cache duration (min 60)

- **Options for list**:
  - `prefix: string`
  - `limit: number` (max 1000)
  - `cursor: string`

**Cross-Platform Equivalent**: Fastly KV Store

**Unification Strategy**:
- API shapes are very similar between platforms
- Cloudflare has richer features: metadata, multi-key get, list operation
- Fastly KV returns entry objects; Cloudflare returns values directly
- Write rate limits: Cloudflare 1 write/key/second; Fastly similar constraints
- Both have eventual consistency with ~60 second propagation

**Code Example**:

```javascript
// Cloudflare Workers KV usage
export default {
  async fetch(request, env) {
    // Write with expiration and metadata
    await env.MY_KV.put('user:123', JSON.stringify({ name: 'Alice' }), {
      expirationTtl: 86400,
      metadata: { created: Date.now() }
    });

    // Read with type
    const user = await env.MY_KV.get('user:123', 'json');

    // Read with metadata
    const { value, metadata } = await env.MY_KV.getWithMetadata('user:123', 'json');

    // List keys with prefix
    const { keys, list_complete, cursor } = await env.MY_KV.list({ prefix: 'user:' });

    // Delete
    await env.MY_KV.delete('user:123');

    return new Response(JSON.stringify(user));
  }
};
```

---

### R2

**Purpose**: S3-compatible object storage for large files and binary data.

**Documentation**: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/

**Key Classes/Functions**:

- **R2Bucket** (via env.MY_BUCKET binding)
  - `head(key: string): Promise<R2Object | null>`
  - `get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>`
  - `put(key: string, value, options?: R2PutOptions): Promise<R2Object | null>`
  - `delete(key: string | string[]): Promise<void>`
  - `list(options?: R2ListOptions): Promise<R2Objects>`
  - `createMultipartUpload(key, options?): Promise<R2MultipartUpload>`
  - `resumeMultipartUpload(key, uploadId): R2MultipartUpload`

- **R2Object** properties:
  - `key`, `version`, `size`, `etag`, `httpEtag`, `uploaded`
  - `httpMetadata`, `customMetadata`, `checksums`, `storageClass`

- **R2ObjectBody** (extends R2Object):
  - `body: ReadableStream`
  - `text()`, `json()`, `arrayBuffer()`, `blob()`

- **R2PutOptions**:
  - `httpMetadata`, `customMetadata`
  - Hash verification: `md5`, `sha1`, `sha256`, `sha384`, `sha512`
  - `storageClass: 'Standard' | 'InfrequentAccess'`

- **R2ListOptions**:
  - `limit`, `prefix`, `cursor`, `delimiter`, `include`

**Cross-Platform Equivalent**: Fastly Object Storage (https://www.fastly.com/documentation/guides/platform/object-storage/)

**Unification Strategy**:
- **Both platforms have object storage**: Cloudflare R2 and Fastly Object Storage
- **Use [@adobe/helix-shared-storage](https://github.com/adobe/helix-shared/tree/main/packages/helix-shared-storage)** for unified access
- helix-shared-storage provides a consistent interface across S3, R2, Azure Blob, and GCS
- Platform-native R2 API is only needed for R2-specific features (multipart uploads, conditional operations)
- For most use cases, use the unified storage library rather than platform-specific APIs

**Code Example**:

```javascript
// Cloudflare R2 usage
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const key = url.pathname.slice(1);

    if (request.method === 'PUT') {
      const object = await env.MY_BUCKET.put(key, request.body, {
        httpMetadata: {
          contentType: request.headers.get('Content-Type')
        },
        customMetadata: {
          uploadedBy: 'worker'
        }
      });
      return new Response(`Stored ${key}, etag: ${object.etag}`);
    }

    if (request.method === 'GET') {
      const object = await env.MY_BUCKET.get(key);
      if (!object) {
        return new Response('Not Found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);

      return new Response(object.body, { headers });
    }

    return new Response('Method not allowed', { status: 405 });
  }
};
```

---

### Durable Objects

**Purpose**: Strongly consistent, stateful compute with co-located storage and single-threaded execution.

**Documentation**: https://developers.cloudflare.com/durable-objects/api/namespace/

**Key Classes/Functions**:

- **DurableObjectNamespace** (via env.MY_DURABLE_OBJECT binding)
  - `idFromName(name: string): DurableObjectId`
  - `newUniqueId(options?): DurableObjectId`
  - `idFromString(id: string): DurableObjectId`
  - `get(id: DurableObjectId, options?): DurableObjectStub`
  - `getByName(name: string): DurableObjectStub`
  - `jurisdiction(region: string): DurableObjectNamespace`

- **DurableObjectStub**
  - Can invoke RPC methods on the Durable Object instance
  - `fetch(request)` for HTTP-style communication

- **DurableObject** (base class for implementation)
  - `fetch(request)` handler
  - `ctx.storage` - SQLite or KV-backed storage
  - `ctx.storage.sql.exec()` - SQL queries (modern API)

**Cross-Platform Equivalent**: None (Fastly has no equivalent)

**Unification Strategy**:
- Durable Objects provide unique capabilities: global coordination, strong consistency
- No Fastly equivalent; this is a differentiating Cloudflare feature
- For unification, consider external coordination services (Redis, DynamoDB)
- Applications requiring DO should be marked as Cloudflare-only or use alternative architecture

**Code Example**:

```javascript
// Cloudflare Durable Objects usage
export class Counter {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Using SQL storage (modern API)
    if (url.pathname === '/increment') {
      const result = await this.ctx.storage.sql.exec(
        'INSERT INTO counters (name, value) VALUES (?, 1) ' +
        'ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value',
        ['main']
      ).one();
      return new Response(result.value.toString());
    }

    return new Response('Not found', { status: 404 });
  }
}

// Worker using Durable Object
export default {
  async fetch(request, env) {
    const id = env.COUNTER.idFromName('global-counter');
    const stub = env.COUNTER.get(id);
    return stub.fetch(request);
  }
};
```

---

## Cross-Platform Mapping

| Fastly Module | Cloudflare Equivalent | Compatibility Level |
|---------------|----------------------|---------------------|
| `fastly:cache` (SimpleCache) | Cache API (`caches.default`) | Partial - Different semantics |
| `fastly:cache-override` | `fetch()` cf options | Partial - Header-based vs declarative |
| `fastly:kv-store` | Workers KV | High - Similar APIs |
| `fastly:config-store` | Environment Variables / KV | Moderate - Sync vs async |
| `fastly:secret-store` | Environment Secrets | Moderate - Different access patterns |
| None | R2 (Object Storage) | No equivalent |
| None | Durable Objects | No equivalent |

---

## Unified Adapter Patterns

### Complete Unified Storage Interface

```javascript
// storage-adapter.js
export class UnifiedStorage {
  constructor(platform, bindings) {
    this.platform = platform;
    this.bindings = bindings;
    this.adapters = {};
  }

  async init() {
    // Initialize platform-specific adapters
    if (this.platform === 'fastly') {
      this.adapters.kv = new FastlyKVAdapter(this.bindings.kvStoreName);
      this.adapters.cache = new FastlyCacheAdapter();
      this.adapters.config = new FastlyConfigAdapter(this.bindings.configStoreName);
      this.adapters.secrets = new FastlySecretAdapter(this.bindings.secretStoreName);
    } else if (this.platform === 'cloudflare') {
      this.adapters.kv = new CloudflareKVAdapter(this.bindings.KV);
      this.adapters.cache = new CloudflareCacheAdapter();
      this.adapters.config = new CloudflareConfigAdapter(this.bindings.env);
      this.adapters.secrets = new CloudflareSecretAdapter(this.bindings.env);
      if (this.bindings.R2) {
        this.adapters.objects = new CloudflareR2Adapter(this.bindings.R2);
      }
    }

    await Promise.all(Object.values(this.adapters).map(a => a.init?.()));
  }

  getKVStore() {
    return this.adapters.kv;
  }

  getCache() {
    return this.adapters.cache;
  }

  getConfig() {
    return this.adapters.config;
  }

  getSecrets() {
    return this.adapters.secrets;
  }

  getObjectStore() {
    if (!this.adapters.objects) {
      throw new Error('Object storage not available on this platform');
    }
    return this.adapters.objects;
  }
}

// Platform-specific adapter implementations
class FastlyKVAdapter {
  constructor(storeName) {
    this.storeName = storeName;
  }

  async init() {
    const { KVStore } = await import('fastly:kv-store');
    this.store = new KVStore(this.storeName);
  }

  async get(key, options = {}) {
    const entry = await this.store.get(key);
    if (!entry) return null;

    const type = options.type || 'text';
    switch (type) {
      case 'json': return entry.json();
      case 'arrayBuffer': return entry.arrayBuffer();
      case 'stream': return entry.body;
      default: return entry.text();
    }
  }

  async put(key, value) {
    await this.store.put(key, value);
  }

  async delete(key) {
    await this.store.delete(key);
  }

  async list() {
    throw new Error('List not supported on Fastly KV Store');
  }
}

class CloudflareKVAdapter {
  constructor(binding) {
    this.store = binding;
  }

  async init() {
    // No initialization needed
  }

  async get(key, options = {}) {
    return this.store.get(key, options.type || 'text');
  }

  async put(key, value, options = {}) {
    await this.store.put(key, value, options);
  }

  async delete(key) {
    await this.store.delete(key);
  }

  async list(options = {}) {
    return this.store.list(options);
  }
}

class FastlyCacheAdapter {
  async init() {
    this.SimpleCache = (await import('fastly:cache')).SimpleCache;
  }

  async get(key) {
    return this.SimpleCache.get(key);
  }

  async getOrSet(key, fetchFn, ttl) {
    return this.SimpleCache.getOrSet(key, async () => ({
      value: await fetchFn(),
      ttl
    }));
  }

  async purge(key) {
    this.SimpleCache.purge(key, { scope: 'global' });
  }
}

class CloudflareCacheAdapter {
  async init() {
    this.cache = caches.default;
  }

  async get(key) {
    const cacheKey = new Request(`https://cache.internal/${key}`);
    const response = await this.cache.match(cacheKey);
    return response ? response.text() : null;
  }

  async getOrSet(key, fetchFn, ttl) {
    const cacheKey = new Request(`https://cache.internal/${key}`);
    let response = await this.cache.match(cacheKey);

    if (!response) {
      const value = await fetchFn();
      const body = typeof value === 'string' ? value : JSON.stringify(value);
      response = new Response(body, {
        headers: { 'Cache-Control': `s-maxage=${ttl}` }
      });
      await this.cache.put(cacheKey, response.clone());
      return value;
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async purge(key) {
    const cacheKey = new Request(`https://cache.internal/${key}`);
    await this.cache.delete(cacheKey);
  }
}

class FastlyConfigAdapter {
  constructor(storeName) {
    this.storeName = storeName;
  }

  async init() {
    const { ConfigStore } = await import('fastly:config-store');
    this.store = new ConfigStore(this.storeName);
  }

  get(key) {
    return this.store.get(key);
  }
}

class CloudflareConfigAdapter {
  constructor(env) {
    this.env = env;
  }

  async init() {
    // No initialization needed
  }

  get(key) {
    return this.env[key] || null;
  }
}

class FastlySecretAdapter {
  constructor(storeName) {
    this.storeName = storeName;
  }

  async init() {
    const { SecretStore } = await import('fastly:secret-store');
    this.store = new SecretStore(this.storeName);
  }

  async get(key) {
    const entry = await this.store.get(key);
    return entry ? entry.plaintext() : null;
  }
}

class CloudflareSecretAdapter {
  constructor(env) {
    this.env = env;
  }

  async init() {
    // No initialization needed
  }

  async get(key) {
    return this.env[key] || null;
  }
}

class CloudflareR2Adapter {
  constructor(binding) {
    this.bucket = binding;
  }

  async init() {
    // No initialization needed
  }

  async get(key) {
    return this.bucket.get(key);
  }

  async put(key, value, options = {}) {
    return this.bucket.put(key, value, options);
  }

  async delete(key) {
    await this.bucket.delete(key);
  }

  async list(options = {}) {
    return this.bucket.list(options);
  }

  async head(key) {
    return this.bucket.head(key);
  }
}
```

### Usage Example

```javascript
// main.js
import { UnifiedStorage } from './storage-adapter.js';

export default {
  async fetch(request, env) {
    // Detect platform
    const platform = typeof env.KV !== 'undefined' ? 'cloudflare' : 'fastly';

    // Initialize unified storage
    const storage = new UnifiedStorage(platform, {
      // Cloudflare bindings
      KV: env.MY_KV,
      R2: env.MY_R2,
      env: env,
      // Fastly store names
      kvStoreName: 'my-kv-store',
      configStoreName: 'my-config',
      secretStoreName: 'my-secrets'
    });

    await storage.init();

    // Use unified APIs
    const kv = storage.getKVStore();
    const cache = storage.getCache();
    const config = storage.getConfig();
    const secrets = storage.getSecrets();

    // Example: Cached data fetch with KV fallback
    const data = await cache.getOrSet('user:123', async () => {
      const cached = await kv.get('user:123', { type: 'json' });
      if (cached) return cached;

      const apiKey = await secrets.get('API_KEY');
      const response = await fetch('https://api.example.com/user/123', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const user = await response.json();
      await kv.put('user:123', JSON.stringify(user));
      return user;
    }, 300);

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

---

## Key Differences and Limitations

### Fastly Advantages
- Global cache purge capabilities
- Synchronous config store access
- Declarative cache override options
- Backend routing integration

### Cloudflare Advantages
- KV metadata support
- Multi-key operations
- Key listing/enumeration
- R2 object storage (Fastly has equivalent: Fastly Object Storage)
- Durable Objects for coordination (no Fastly equivalent)
- Richer cache control via headers

### Unification Challenges

1. **Cache Semantics**: Fastly uses key-value, Cloudflare uses Request/Response
2. **Async vs Sync**: Fastly ConfigStore is sync, Cloudflare KV is async
3. **Missing Features**: List operations, metadata, object storage gaps
4. **Platform-Specific**: Durable Objects, CacheOverride callbacks
5. **Consistency Models**: Both have eventual consistency, but different propagation

### Recommendations

1. **Use abstraction layer** for maximum portability
2. **Feature detection** for platform-specific capabilities
3. **Graceful degradation** for missing features (R2, Durable Objects)
4. **Test thoroughly** on both platforms
5. **Document limitations** for your specific use cases
6. **Consider external services** for features not available on both platforms

---

## Implementation Recommendations

Based on the helix-universal adapter pattern (see [PR #426](https://github.com/adobe/helix-universal/pull/426)), here are recommendations for implementing Cache and Storage APIs in an edge deployment plugin:

### Edge Wrapper Implementation

The following functionality should be **built into the edge wrapper itself** as core adapter features:

1. **Storage Binding Initialization** ✅ **Edge Wrapper**
   - Platform-specific storage initialization (Fastly KVStore names vs Cloudflare bindings)
   - Environment variable handling (`context.env`)
   - **Rationale**: Storage access patterns differ fundamentally between platforms
   - **Example**: Wrapper converts Cloudflare `env.MY_KV` bindings to Fastly `new KVStore('MY_KV')`

2. **Config/Secrets Access** ✅ **Edge Wrapper**
   - Unified `context.env` for environment variables and secrets
   - Automatic secrets loading from platform-specific managers
   - **Rationale**: Similar to helix-universal's built-in secrets plugins (AWS, Google)
   - **Example**: Load from Fastly ConfigStore/SecretStore or Cloudflare environment variables

3. **Storage Presigned URLs** ✅ **Edge Wrapper**
   - `context.storage.presignURL()` method (similar to helix-universal)
   - Platform-specific implementation (S3, R2, GCS)
   - **Rationale**: Core storage operation that should work consistently
   - **Example**: Generate presigned URLs for uploading/downloading from cloud storage

### Plugin Implementation

The following functionality should be implemented as **optional plugins** that can be composed:

1. **KV Storage** 🔌 **Plugin**
   - Unified KV store interface (`UnifiedKVStore`)
   - Cross-platform get/put/delete operations
   - **Rationale**: Not all edge functions need KV storage; opt-in via plugin
   - **Example**: `@adobe/helix-edge-kv` plugin adds `context.kv` with unified interface
   - **Usage**:
     ```javascript
     export const handler = edge
       .with(kvPlugin, { store: 'MY_STORE' })
       .wrap(async (request, context) => {
         const data = await context.kv.get('key');
         await context.kv.put('key', 'value');
       });
     ```

2. **Cache Management** 🔌 **Plugin**
   - Unified cache interface (`UnifiedCache`)
   - Cache key generation and normalization
   - TTL management across platforms
   - **Rationale**: Caching strategies are application-specific
   - **Example**: `@adobe/helix-edge-cache` plugin with getOrSet pattern
   - **Usage**:
     ```javascript
     export const handler = edge
       .with(cachePlugin, { defaultTTL: 3600 })
       .wrap(async (request, context) => {
         const data = await context.cache.getOrSet('key', async () => {
           return await fetchExpensiveData();
         }, 3600);
       });
     ```

3. **Durable Objects** ❌ **Use Native APIs**
   - Cloudflare-only coordination and state management
   - No Fastly equivalent - use native Durable Objects API
   - **Rationale**: Platform-specific feature, no cross-platform abstraction needed
   - **Alternative**: External coordination services (Redis, DynamoDB) for cross-platform needs

### Import/Polyfill Implementation

The following functionality should be provided as **imports or polyfills**:

1. **Object Storage** 📦 **Import** ⭐ **RECOMMENDED**
   - **Use [@adobe/helix-shared-storage](https://github.com/adobe/helix-shared/tree/main/packages/helix-shared-storage)** for unified object storage
   - Supports both Cloudflare R2 and Fastly Object Storage (plus S3, Azure, GCS)
   - Platform-agnostic storage operations with consistent API
   - **Rationale**: Both platforms have object storage; use unified library
   - **Example**: Import and configure directly in function code
   - **Usage**:
     ```javascript
     import { StorageClient } from '@adobe/helix-shared-storage';

     export async function main(request, context) {
       // Works on both Cloudflare (R2) and Fastly (Object Storage)
       const storage = new StorageClient({
         bucket: context.env.STORAGE_BUCKET,
         region: context.env.STORAGE_REGION,
         credentials: {
           accessKeyId: context.env.AWS_ACCESS_KEY_ID,
           secretAccessKey: context.env.AWS_SECRET_ACCESS_KEY,
         }
       });

       await storage.put('key', 'value');
       const value = await storage.get('key');
     }
     ```

2. **Cache Utilities** 📦 **Import**
   - Cache key generation helpers
   - ETag/If-None-Match handling
   - Cache-Control header utilities
   - **Rationale**: Standard HTTP caching, not platform-specific
   - **Example**: `@adobe/helix-shared-cache-utils` library

3. **Data Serialization** 📦 **Import**
   - JSON/MessagePack/Protocol Buffers serialization
   - Compression utilities (gzip, brotli)
   - **Rationale**: Application-level concerns
   - **Example**: Standard JavaScript libraries

### Context Storage API

Following helix-universal's `context.storage.presignURL()` pattern, the edge wrapper should provide:

```javascript
interface UnifiedContext {
  // Environment variables and secrets (wrapper)
  env: Record<string, string>;

  // Presigned URL generation (wrapper)
  storage: {
    presignURL(
      bucket: string,
      path: string,
      options?: {
        contentType?: string;
        contentDisposition?: string;
        method?: 'GET' | 'PUT';
        expires?: number;
      }
    ): Promise<string>;
  };

  // KV store (plugin: @adobe/helix-edge-kv)
  kv?: {
    get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' }): Promise<any>;
    put(key: string, value: string | ArrayBuffer, options?: { ttl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list?(options?: { prefix?: string; limit?: number }): Promise<{ keys: string[] }>;
  };

  // Cache (plugin: @adobe/helix-edge-cache)
  cache?: {
    get(key: string): Promise<any | null>;
    getOrSet(key: string, fetchFn: () => Promise<any>, ttl: number): Promise<any>;
    purge(key: string): Promise<void>;
  };

  // Attributes for caching initialized storage clients (wrapper)
  attributes: {
    storage?: any; // Cached storage clients
    [key: string]: any;
  };
}
```

### Secrets Plugin Design

Similar to helix-universal's AWS/Google secrets plugins, the edge wrapper should include built-in secrets loading:

**Fastly Secrets:**
```javascript
// Automatically loaded by wrapper
// From: Fastly SecretStore (async) or ConfigStore (sync)
context.env.API_KEY // Loaded from /helix-deploy/{package}/secrets
context.env.DATABASE_URL
```

**Cloudflare Secrets:**
```javascript
// Automatically available via bindings
context.env.API_KEY // From environment variables/secrets
context.env.DATABASE_URL
```

### Storage Caching Pattern

Following helix-universal's `context.attributes` pattern for caching initialized resources:

```javascript
// Plugin wrapper
function storagePlugin(options) {
  return async (request, context, next) => {
    // Initialize once and cache in attributes
    if (!context.attributes.storageClient) {
      const { createStorage } = await import('@adobe/helix-shared-storage');
      context.attributes.storageClient = createStorage({
        bucket: context.env.STORAGE_BUCKET,
        region: context.env.AWS_REGION,
      });
    }

    // Make available via context.storage
    context.storage.bucket = context.attributes.storageClient;

    return next(request, context);
  };
}
```

### Platform-Specific Features

Some features are inherently platform-specific and should be handled via conditional plugins:

**Cloudflare-Only Features:**
- R2 Object Storage → `@adobe/helix-edge-r2` plugin
- Durable Objects → `@adobe/helix-edge-durable` plugin
- Workers KV metadata → Extended KV plugin options

**Fastly-Only Features:**
- Global cache purge → Extended cache plugin with surrogate keys
- CacheOverride callbacks → Extended fetch wrapper

**Graceful Degradation:**
```javascript
export const handler = edge
  .with(r2Plugin, { required: false }) // Skip if not Cloudflare
  .wrap(async (request, context) => {
    if (context.r2) {
      // Use R2 if available
      await context.r2.put('key', 'value');
    } else {
      // Fallback to external storage
      await externalStorage.put('key', 'value');
    }
  });
```

---

## References

### Fastly Documentation
- [SimpleCache](https://js-compute-reference-docs.edgecompute.app/docs/fastly:cache/SimpleCache/)
- [CacheOverride](https://js-compute-reference-docs.edgecompute.app/docs/fastly:cache-override/CacheOverride/)
- [KVStore](https://js-compute-reference-docs.edgecompute.app/docs/fastly:kv-store/KVStore/)
- [ConfigStore](https://js-compute-reference-docs.edgecompute.app/docs/fastly:config-store/ConfigStore/)
- [SecretStore](https://js-compute-reference-docs.edgecompute.app/docs/fastly:secret-store/SecretStore/prototype/get)

### Cloudflare Documentation
- [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Workers KV](https://developers.cloudflare.com/kv/api/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/api/namespace/)
- [Cache API Examples](https://developers.cloudflare.com/workers/examples/cache-api/)

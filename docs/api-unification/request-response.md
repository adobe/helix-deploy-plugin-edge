# Request/Response/Fetch API Unification Analysis

This document provides a comprehensive analysis of the Request, Response, and Fetch APIs for both Fastly Compute and Cloudflare Workers platforms, with recommendations for creating a unified adapter layer.

## Table of Contents

1. [Request API](#request-api)
2. [Response API](#response-api)
3. [Fetch API](#fetch-api)
4. [Headers API](#headers-api)
5. [Event/Handler Pattern](#eventhandler-pattern)
6. [Geolocation and Client Metadata](#geolocation-and-client-metadata)
7. [Backend/Origin Selection](#backendorigin-selection)
8. [Unification Strategy Summary](#unification-strategy-summary)

---

## Request API

### Platform: Both (Fastly and Cloudflare)

### Purpose
Create and manage HTTP requests, representing incoming client requests and outbound requests to origins.

### Key Methods/Properties

#### Standard (Both Platforms)
- **Constructor**: `new Request(input, options)`
- **Properties**: `body`, `bodyUsed`, `headers`, `method`, `url`, `redirect`, `signal`
- **Methods**: `clone()`, `arrayBuffer()`, `formData()`, `json()`, `text()`

#### Fastly-Specific Properties
```javascript
// Request options
{
  backend: 'origin-name',           // Target backend specification
  cacheOverride: CacheOverride,     // Cache control reference
  cacheKey: 'custom-key',           // Custom cache key
  manualFramingHeaders: false,      // Control header generation
  fastly: {
    decompressGzip: true            // Auto gzip decompression
  }
}
```

#### Cloudflare-Specific Properties
```javascript
// Request options - cf object
{
  cf: {
    // Caching Controls
    cacheEverything: true,
    cacheKey: 'custom-key',
    cacheTags: ['tag1', 'tag2'],
    cacheTtl: 3600,
    cacheTtlByStatus: { '200-299': 86400, '404': 1 },

    // Image Optimization
    image: { /* image resizing options */ },
    polish: 'lossy',
    webp: true,
    mirage: false,

    // Security/Routing
    scrapeShield: true,
    resolveOverride: 'alternate.hostname.com',
    apps: true
  }
}
```

### Platform Differences

| Feature | Fastly | Cloudflare |
|---------|--------|------------|
| Backend Selection | `backend` property in options | No direct equivalent (uses origin URL) |
| Cache Key | `cacheKey` in options | `cf.cacheKey` |
| Cache Override | `cacheOverride` object | `cf.cacheTtl`, `cf.cacheTtlByStatus` |
| Gzip Handling | `fastly.decompressGzip` | Automatic |
| Manual Framing | `manualFramingHeaders` | `encodeBody: 'manual'` (Response only) |
| Image Optimization | Not built-in | `cf.image`, `cf.polish`, `cf.webp` |
| Request Metadata | Via FetchEvent.client | `request.cf` object |

### Unification Strategy

```javascript
// Unified Request wrapper
class UnifiedRequest {
  constructor(input, options = {}) {
    this._platformOptions = {};

    // Normalize cache key
    if (options.cacheKey) {
      if (isPlatform('fastly')) {
        this._platformOptions.cacheKey = options.cacheKey;
      } else {
        this._platformOptions.cf = this._platformOptions.cf || {};
        this._platformOptions.cf.cacheKey = options.cacheKey;
      }
    }

    // Normalize backend selection
    if (options.backend) {
      if (isPlatform('fastly')) {
        this._platformOptions.backend = options.backend;
      }
      // Cloudflare: backend resolved through URL routing
    }

    return new Request(input, {
      ...options,
      ...this._platformOptions
    });
  }
}
```

**Documentation Links:**
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/Request
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/request/

---

## Response API

### Platform: Both

### Purpose
Create HTTP responses to send back to clients or represent responses from origin servers.

### Key Methods/Properties

#### Standard (Both Platforms)
- **Constructor**: `new Response(body, init)`
- **Body Types**: ArrayBuffer, TypedArray, DataView, ReadableStream, URLSearchParams, String, Blob, FormData, null
- **Properties**: `body`, `bodyUsed`, `headers`, `ok`, `redirected`, `status`, `statusText`, `url`
- **Static Methods**: `Response.redirect()`, `Response.json()` (Cloudflare)
- **Instance Methods**: `clone()`, `arrayBuffer()`, `formData()`, `json()`, `text()`

#### Fastly-Specific Options
```javascript
new Response(body, {
  status: 200,
  statusText: 'OK',
  headers: new Headers(),
  manualFramingHeaders: true  // Control Content-Length/Transfer-Encoding
});
```

#### Cloudflare-Specific Options
```javascript
new Response(body, {
  status: 200,
  statusText: 'OK',
  headers: new Headers(),
  cf: { /* metadata object */ },
  encodeBody: 'automatic',  // or 'manual' for pre-compressed
  webSocket: webSocketObject  // For WebSocket upgrades
});
```

### Platform Differences

| Feature | Fastly | Cloudflare |
|---------|--------|------------|
| Manual Framing | `manualFramingHeaders: true` | `encodeBody: 'manual'` |
| WebSocket Support | Not documented | `webSocket` property |
| CF Metadata | N/A | `cf` object in options |
| Content-Length | Manual or auto based on `manualFramingHeaders` | Auto-set by runtime |
| Static json() | Standard Fetch API | Standard Fetch API |

### Unification Strategy

```javascript
class UnifiedResponse extends Response {
  constructor(body, init = {}) {
    const platformInit = { ...init };

    // Handle manual encoding
    if (init.manualFramingHeaders !== undefined) {
      if (isPlatform('fastly')) {
        platformInit.manualFramingHeaders = init.manualFramingHeaders;
      } else {
        platformInit.encodeBody = init.manualFramingHeaders ? 'manual' : 'automatic';
      }
      delete platformInit.manualFramingHeaders;
    }

    super(body, platformInit);
  }
}
```

**Documentation Links:**
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/Response
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/response/

---

## Fetch API

### Platform: Both

### Purpose
Make outbound HTTP requests to origin servers or other services.

### Key Methods/Properties

#### Standard (Both Platforms)
```javascript
fetch(resource)
fetch(resource, options)
```
- Returns: `Promise<Response>`
- Resource: String URL, URL object, or Request object
- Only rejects on network errors, not HTTP errors

#### Fastly-Specific Behavior
```javascript
// Backend is REQUIRED for Fastly
fetch('https://origin.example.com/path', {
  backend: 'my-backend',  // Required unless dynamic backends enabled
  cacheOverride: new CacheOverride(...),
  cacheKey: 'custom-key',
  fastly: {
    decompressGzip: true
  }
});

// Dynamic backends (when enabled by Fastly Support)
const backend = new Backend({
  name: 'dynamic-origin',
  target: 'origin.example.com',
  useSSL: true,
  connectTimeout: 5000,
  firstByteTimeout: 15000,
  betweenBytesTimeout: 10000
});
```

#### Cloudflare-Specific Behavior
```javascript
// No explicit backend needed
fetch('https://origin.example.com/path', {
  cache: 'no-store',  // Only 'no-store' or 'no-cache' supported
  cf: {
    cacheTtl: 3600,
    cacheEverything: true,
    image: { /* resizing */ }
  }
});

// IMPORTANT: fetch() must be called within a handler, not global scope
```

### Platform Differences

| Feature | Fastly | Cloudflare |
|---------|--------|------------|
| Backend Requirement | **Required** (or dynamic backends enabled) | Not required |
| Backend Configuration | `Backend()` class with detailed config | Implicit via URL |
| Cache Control | `cacheOverride`, `cacheKey` | `cf.cacheTtl`, `cf.cacheKey`, `cache` option |
| Cache Modes | Custom CacheOverride API | Only `no-store` or `no-cache` |
| Compression | `fastly.decompressGzip` | Automatic gzip/brotli handling |
| Global Scope | Allowed | **Not allowed** (must be in handler) |
| Connection Pooling | Configurable via Backend | Automatic |
| Timeouts | Configurable per-backend | Platform managed |
| TLS Settings | Configurable (version, ciphers, certs) | Platform managed |

### Unification Strategy

```javascript
// Backend registry for cross-platform compatibility
const backends = new Map();

function registerBackend(name, config) {
  if (isPlatform('fastly')) {
    const { Backend } = require('fastly:backend');
    backends.set(name, new Backend({
      name,
      target: config.host,
      useSSL: config.useSSL !== false,
      connectTimeout: config.connectTimeout || 10000,
      firstByteTimeout: config.firstByteTimeout || 60000,
      betweenBytesTimeout: config.betweenBytesTimeout || 60000,
      hostOverride: config.hostOverride,
      sniHostname: config.sniHostname
    }));
  } else {
    // Cloudflare: store config for URL transformation
    backends.set(name, config);
  }
}

async function unifiedFetch(resource, options = {}) {
  const { backend, ...fetchOptions } = options;

  if (isPlatform('fastly')) {
    if (backend && typeof backend === 'string') {
      fetchOptions.backend = backend;
    }
    return fetch(resource, fetchOptions);
  } else {
    // Cloudflare: backend name may need URL transformation
    let url = resource;
    if (backend && backends.has(backend)) {
      const backendConfig = backends.get(backend);
      // Transform URL to use backend host if needed
      if (typeof resource === 'string') {
        const parsed = new URL(resource);
        if (backendConfig.host) {
          parsed.host = backendConfig.host;
        }
        url = parsed.toString();
      }
    }
    return fetch(url, fetchOptions);
  }
}
```

**Documentation Links:**
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/fetch
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/fetch/

---

## Headers API

### Platform: Both

### Purpose
Create and manipulate HTTP headers for requests and responses.

### Key Methods/Properties

#### Standard (Both Platforms)
```javascript
new Headers()
new Headers(init)  // object, array of pairs, or Headers

// Methods
headers.append(name, value)
headers.delete(name)
headers.get(name)
headers.has(name)
headers.set(name, value)
headers.forEach(callback)
headers.entries()
headers.keys()
headers.values()
```

### Platform Differences

| Feature | Fastly | Cloudflare |
|---------|--------|------------|
| getAll() | Standard Fetch API behavior | Only for `Set-Cookie` headers |
| Set-Cookie Handling | Standard | Special comma handling (RFC 6265) |
| Restricted Headers | Unknown | Can set typically-restricted headers like `Cookie` |
| Return Type | ByteString | USVString (typically no practical difference) |

### Unification Strategy

```javascript
// Minimal wrapper needed - mostly compatible
class UnifiedHeaders extends Headers {
  getAll(name) {
    if (isPlatform('cloudflare') && name.toLowerCase() !== 'set-cookie') {
      // Cloudflare only supports getAll for Set-Cookie
      const value = this.get(name);
      return value ? [value] : [];
    }
    return super.getAll ? super.getAll(name) : [this.get(name)].filter(Boolean);
  }
}
```

**Documentation Links:**
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/Headers
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/headers/

---

## Event/Handler Pattern

### Platform: Both (Different Patterns)

### Purpose
Handle incoming HTTP requests and produce responses.

### Fastly: FetchEvent Pattern (Service Worker Style)
```javascript
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const request = event.request;
  const client = event.client;

  // Access client info
  const clientIP = client.address;
  const geo = client.geo;
  const tlsVersion = client.tlsProtocol;

  // Extend lifetime for async work
  event.waitUntil(doAnalytics());

  return new Response('Hello');
}
```

#### FetchEvent Properties (Fastly)
- `event.request`: Incoming Request object
- `event.client.address`: Client IP (IPv4/IPv6)
- `event.client.geo`: Geolocation data
- `event.client.tlsJA3MD5`: JA3 hash
- `event.client.tlsCipherOpensslName`: Cipher suite
- `event.client.tlsProtocol`: TLS version
- `event.client.tlsClientCertificate`: mTLS certificate (PEM)
- `event.client.tlsClientHello`: Raw TLS ClientHello
- `event.server.address`: Server IP

#### FetchEvent Methods (Fastly)
- `event.respondWith(response)`: Supply response
- `event.waitUntil(promise)`: Extend event lifetime

### Cloudflare: Module Worker Pattern
```javascript
export default {
  async fetch(request, env, ctx) {
    // Access request metadata
    const cf = request.cf;
    const geo = cf.country;
    const tlsVersion = cf.tlsVersion;

    // Environment bindings
    const kv = env.MY_KV;

    // Extend lifetime
    ctx.waitUntil(doAnalytics());

    // Fail open on error
    ctx.passThroughOnException();

    return new Response('Hello');
  }
};
```

#### Handler Parameters (Cloudflare)
- `request`: Incoming Request with `cf` property
- `env`: Environment bindings (KV, D1, R2, etc.)
- `ctx.waitUntil(promise)`: Extend worker lifetime
- `ctx.passThroughOnException()`: Fail open to origin
- `ctx.props`: Configuration from Service Bindings
- `ctx.exports`: Loopback bindings (requires compatibility flag)

### Platform Differences

| Feature | Fastly (FetchEvent) | Cloudflare (Module Worker) |
|---------|---------------------|---------------------------|
| Pattern | Event listener | Module export |
| Client Info Access | `event.client.*` | `request.cf.*` |
| Geolocation | `event.client.geo` | `request.cf.{country,city,...}` |
| Environment Bindings | Not applicable | `env` parameter |
| Wait Until | `event.waitUntil()` | `ctx.waitUntil()` |
| Fail Open | Not available | `ctx.passThroughOnException()` |
| Response Method | `event.respondWith()` | Return from function |
| TLS Info | `event.client.tls*` | `request.cf.tls*` |

### Unification Strategy

```javascript
// Unified handler interface
class UnifiedContext {
  constructor(platformContext) {
    this._ctx = platformContext;
  }

  waitUntil(promise) {
    if (this._ctx.waitUntil) {
      return this._ctx.waitUntil(promise);
    }
  }

  passThroughOnException() {
    if (this._ctx.passThroughOnException) {
      return this._ctx.passThroughOnException();
    }
    // Fastly: no equivalent, would need try/catch wrapper
  }
}

// Unified request with metadata
function getRequestMetadata(request, event) {
  if (isPlatform('fastly') && event) {
    return {
      clientIP: event.client.address,
      geo: event.client.geo,
      tlsVersion: event.client.tlsProtocol,
      tlsCipher: event.client.tlsCipherOpensslName,
      ja3Hash: event.client.tlsJA3MD5,
      serverIP: event.server.address
    };
  } else if (isPlatform('cloudflare') && request.cf) {
    return {
      clientIP: null, // Available via headers (CF-Connecting-IP)
      geo: {
        country_code: request.cf.country,
        city: request.cf.city,
        continent: request.cf.continent,
        region: request.cf.region,
        latitude: request.cf.latitude,
        longitude: request.cf.longitude,
        postal_code: request.cf.postalCode,
        metro_code: request.cf.metroCode,
        timezone: request.cf.timezone,
        as_number: request.cf.asn,
        as_name: request.cf.asOrganization
      },
      tlsVersion: request.cf.tlsVersion,
      tlsCipher: request.cf.tlsCipher,
      httpProtocol: request.cf.httpProtocol,
      colo: request.cf.colo,
      botManagement: request.cf.botManagement
    };
  }
  return {};
}

// Fastly adapter
addEventListener('fetch', (event) => {
  const ctx = new UnifiedContext(event);
  const metadata = getRequestMetadata(event.request, event);
  event.respondWith(unifiedHandler(event.request, {}, ctx, metadata));
});

// Cloudflare adapter
export default {
  async fetch(request, env, ctx) {
    const unifiedCtx = new UnifiedContext(ctx);
    const metadata = getRequestMetadata(request, null);
    return unifiedHandler(request, env, unifiedCtx, metadata);
  }
};
```

**Documentation Links:**
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/FetchEvent
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/

---

## Geolocation and Client Metadata

### Platform: Both

### Purpose
Access geographic location and network information about connecting clients.

### Fastly Approach

```javascript
// Via FetchEvent
addEventListener('fetch', (event) => {
  const geo = event.client.geo;
  console.log(geo.country_code);  // "US"
  console.log(geo.city);           // "Austin"
});

// Via getGeolocationForIpAddress
import { getGeolocationForIpAddress } from 'fastly:geolocation';

const ipInfo = getGeolocationForIpAddress('8.8.8.8');
```

#### Fastly Geolocation Properties
- `as_name`: Organization name
- `as_number`: ASN
- `city`: City name
- `country_code`: 2-letter ISO code
- `country_code3`: 3-letter ISO code
- `country_name`: Full country name
- `continent`: Continental region
- `region`: ISO 3166-2 subdivision
- `latitude` / `longitude`: Coordinates
- `postal_code`: Postal code
- `metro_code`: DMA code (US)
- `area_code`: Phone area code
- `gmt_offset` / `utc_offset`: Time zone offsets
- `conn_speed`: Connection speed
- `conn_type`: Connection type
- `proxy_type` / `proxy_description`: Proxy info

### Cloudflare Approach

```javascript
export default {
  async fetch(request, env, ctx) {
    const cf = request.cf;
    console.log(cf.country);    // "US"
    console.log(cf.city);       // "Austin"
  }
};
```

#### Cloudflare CF Properties
- `country`: 2-letter country code
- `isEUCountry`: "1" if EU
- `city`: City name
- `continent`: Continent code
- `region`: Region name
- `regionCode`: ISO 3166-2 code
- `latitude` / `longitude`: Coordinates
- `postalCode`: Postal code
- `timezone`: Timezone string
- `metroCode`: DMA code
- `asn`: ASN number
- `asOrganization`: ASN organization
- `colo`: Data center code
- `httpProtocol`: HTTP version
- `tlsVersion` / `tlsCipher`: TLS info
- `botManagement`: Bot detection (requires feature)
- `tlsClientAuth`: mTLS info
- `clientAcceptEncoding`: Original encoding
- `requestPriority`: Browser priority

### Platform Differences

| Property | Fastly | Cloudflare |
|----------|--------|------------|
| Country Code | `country_code` (2-char) | `country` |
| 3-Letter Country | `country_code3` | Not available |
| Full Country Name | `country_name` | Not available |
| Region | `region` (ISO code) | `region` (name), `regionCode` (ISO) |
| Timezone | `gmt_offset`, `utc_offset` | `timezone` (string) |
| ASN | `as_number` | `asn` |
| ASN Org | `as_name` | `asOrganization` |
| Connection Type | `conn_speed`, `conn_type` | Not available |
| Proxy Info | `proxy_type`, `proxy_description` | Not available |
| Phone Area Code | `area_code` | Not available |
| Data Center | Not available | `colo` |
| HTTP Protocol | Via request headers | `httpProtocol` |
| Bot Detection | Not built-in | `botManagement` |
| EU Status | Not available | `isEUCountry` |

### Unification Strategy

```javascript
class UnifiedGeo {
  constructor(platformGeo, platform) {
    this._geo = platformGeo;
    this._platform = platform;
  }

  get countryCode() {
    return this._platform === 'fastly'
      ? this._geo.country_code
      : this._geo.country;
  }

  get countryCode3() {
    return this._platform === 'fastly'
      ? this._geo.country_code3
      : null;
  }

  get countryName() {
    return this._platform === 'fastly'
      ? this._geo.country_name
      : null;
  }

  get city() {
    return this._geo.city;
  }

  get continent() {
    return this._geo.continent;
  }

  get regionCode() {
    return this._platform === 'fastly'
      ? this._geo.region
      : this._geo.regionCode;
  }

  get regionName() {
    return this._platform === 'fastly'
      ? null
      : this._geo.region;
  }

  get latitude() {
    return this._geo.latitude;
  }

  get longitude() {
    return this._geo.longitude;
  }

  get postalCode() {
    return this._platform === 'fastly'
      ? this._geo.postal_code
      : this._geo.postalCode;
  }

  get metroCode() {
    return this._platform === 'fastly'
      ? this._geo.metro_code
      : this._geo.metroCode;
  }

  get timezone() {
    if (this._platform === 'cloudflare') {
      return this._geo.timezone;
    }
    // Fastly: would need to convert offset to timezone string
    return null;
  }

  get asn() {
    return this._platform === 'fastly'
      ? this._geo.as_number
      : this._geo.asn;
  }

  get asnOrganization() {
    return this._platform === 'fastly'
      ? this._geo.as_name
      : this._geo.asOrganization;
  }

  get isEU() {
    if (this._platform === 'cloudflare') {
      return this._geo.isEUCountry === '1';
    }
    // Fastly: would need EU country list
    const euCountries = ['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'];
    return euCountries.includes(this.countryCode);
  }
}

function getUnifiedGeo(event, request) {
  if (isPlatform('fastly') && event?.client?.geo) {
    return new UnifiedGeo(event.client.geo, 'fastly');
  } else if (isPlatform('cloudflare') && request?.cf) {
    return new UnifiedGeo(request.cf, 'cloudflare');
  }
  return null;
}
```

**Documentation Links:**
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/fastly:geolocation/getGeolocationForIpAddress
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/request/ (cf object section)

---

## Backend/Origin Selection

### Platform: Fastly (explicit) vs Cloudflare (implicit)

### Purpose
Route outbound requests to appropriate origin servers.

### Fastly: Explicit Backend Configuration

```javascript
import { Backend } from 'fastly:backend';

// Create dynamic backend
const origin = new Backend({
  name: 'api-origin',
  target: 'api.example.com',

  // Connection settings
  connectTimeout: 5000,           // ms
  firstByteTimeout: 15000,        // ms
  betweenBytesTimeout: 10000,     // ms

  // HTTP settings
  hostOverride: 'api.example.com',
  dontPool: false,                // Enable connection pooling
  httpKeepalive: 60000,           // ms
  tcpKeepalive: true,             // Enable TCP keepalive

  // TLS settings
  useSSL: true,
  tlsMinVersion: 1.2,
  tlsMaxVersion: 1.3,
  caCertificate: 'PEM_CERT_DATA',
  certificateHostname: 'api.example.com',
  ciphers: 'ECDHE-RSA-AES128-GCM-SHA256',
  sniHostname: 'api.example.com',

  // Client certificates (mTLS)
  clientCertificate: {
    certificate: 'PEM_CERT',
    key: secretStoreEntry
  },

  // Advanced
  grpc: false                     // Experimental gRPC support
});

// Use in fetch
fetch('https://api.example.com/data', {
  backend: 'api-origin'
});
```

### Cloudflare: Implicit Routing

```javascript
// No explicit backend configuration needed
// Origin is determined by URL
fetch('https://api.example.com/data', {
  cf: {
    // Cache and optimization settings only
    cacheTtl: 3600,
    resolveOverride: 'alternate-host.example.com' // DNS override
  }
});
```

### Platform Differences

| Feature | Fastly | Cloudflare |
|---------|--------|------------|
| Backend Definition | **Explicit Backend class** | Implicit via URL |
| Connection Timeouts | Configurable per-backend | Platform managed |
| TLS Version Control | `tlsMinVersion`, `tlsMaxVersion` | Not configurable |
| Custom Ciphers | `ciphers` option | Not configurable |
| mTLS Client Certs | `clientCertificate` | Not directly available |
| Connection Pooling | `dontPool`, `httpKeepalive` | Automatic |
| TCP Keepalive | Configurable | Automatic |
| Host Override | `hostOverride` | Via headers |
| DNS Override | N/A | `cf.resolveOverride` |
| Health Checks | Service configuration | Workers Health Checks (separate) |

### Unification Strategy

```javascript
// Unified backend configuration
const backendConfigs = {
  'api-origin': {
    host: 'api.example.com',
    port: 443,
    useSSL: true,
    connectTimeout: 5000,
    firstByteTimeout: 15000,
    betweenBytesTimeout: 10000,
    tlsMinVersion: 1.2,
    hostOverride: 'api.example.com'
  }
};

class UnifiedBackendManager {
  constructor() {
    this._backends = new Map();
  }

  register(name, config) {
    if (isPlatform('fastly')) {
      const { Backend } = require('fastly:backend');
      const backendConfig = {
        name,
        target: `${config.host}:${config.port || 443}`,
        useSSL: config.useSSL !== false
      };

      // Map unified config to Fastly options
      if (config.connectTimeout) {
        backendConfig.connectTimeout = config.connectTimeout;
      }
      if (config.firstByteTimeout) {
        backendConfig.firstByteTimeout = config.firstByteTimeout;
      }
      if (config.betweenBytesTimeout) {
        backendConfig.betweenBytesTimeout = config.betweenBytesTimeout;
      }
      if (config.hostOverride) {
        backendConfig.hostOverride = config.hostOverride;
      }
      if (config.tlsMinVersion) {
        backendConfig.tlsMinVersion = config.tlsMinVersion;
      }
      if (config.tlsMaxVersion) {
        backendConfig.tlsMaxVersion = config.tlsMaxVersion;
      }

      this._backends.set(name, new Backend(backendConfig));
    } else {
      // Cloudflare: store config for runtime use
      this._backends.set(name, config);
    }
  }

  async fetch(url, options = {}) {
    const { backend: backendName, ...fetchOptions } = options;

    if (!backendName || !this._backends.has(backendName)) {
      return fetch(url, fetchOptions);
    }

    if (isPlatform('fastly')) {
      fetchOptions.backend = backendName;
      return fetch(url, fetchOptions);
    } else {
      // Cloudflare: apply config via request options
      const config = this._backends.get(backendName);
      let targetUrl = url;

      // Override host if needed
      if (config.host && typeof url === 'string') {
        const parsed = new URL(url);
        parsed.host = config.port ? `${config.host}:${config.port}` : config.host;
        if (config.useSSL !== false) {
          parsed.protocol = 'https:';
        }
        targetUrl = parsed.toString();
      }

      // Apply CF-specific options
      if (config.hostOverride) {
        fetchOptions.headers = fetchOptions.headers || new Headers();
        if (fetchOptions.headers instanceof Headers) {
          fetchOptions.headers.set('Host', config.hostOverride);
        } else {
          fetchOptions.headers['Host'] = config.hostOverride;
        }
      }

      fetchOptions.cf = fetchOptions.cf || {};
      if (config.resolveOverride) {
        fetchOptions.cf.resolveOverride = config.resolveOverride;
      }

      return fetch(targetUrl, fetchOptions);
    }
  }
}

// Usage
const backends = new UnifiedBackendManager();
backends.register('api', backendConfigs['api-origin']);

// In handler
const response = await backends.fetch('https://api.example.com/data', {
  backend: 'api'
});
```

**Documentation Links:**
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/fastly:backend/Backend
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/fetch/

---

## Unification Strategy Summary

### Core Principles

1. **Abstract Platform Differences**: Create wrapper classes that normalize API differences
2. **Feature Detection**: Use runtime detection to apply platform-specific logic
3. **Lowest Common Denominator**: Default to features available on both platforms
4. **Graceful Degradation**: Provide fallbacks for platform-specific features

### Recommended Architecture

```javascript
// Platform detection
const PLATFORM = typeof fastly !== 'undefined' ? 'fastly' : 'cloudflare';
const isPlatform = (p) => PLATFORM === p;

// Unified exports
export {
  UnifiedRequest,
  UnifiedResponse,
  UnifiedHeaders,
  UnifiedContext,
  UnifiedBackendManager,
  UnifiedGeo,
  unifiedFetch,
  getRequestMetadata,
  isPlatform
};
```

### Key Integration Points

1. **Entry Point Adapter**
   - Fastly: `addEventListener('fetch', ...)` with FetchEvent
   - Cloudflare: `export default { fetch: ... }` module pattern

2. **Request Metadata**
   - Fastly: `event.client.*`
   - Cloudflare: `request.cf.*`

3. **Backend Selection**
   - Fastly: Explicit `backend` option required
   - Cloudflare: URL-based routing

4. **Cache Control**
   - Fastly: `cacheOverride`, `cacheKey`
   - Cloudflare: `cf.cacheTtl`, `cf.cacheKey`, `cf.cacheTtlByStatus`

5. **Lifecycle Management**
   - Fastly: `event.waitUntil()`, `event.respondWith()`
   - Cloudflare: `ctx.waitUntil()`, `ctx.passThroughOnException()`, return Response

### Implementation Priority

1. **High Priority** (Core functionality):
   - Request/Response wrappers
   - Backend abstraction layer
   - Handler/Event adapters
   - Geolocation normalization

2. **Medium Priority** (Common features):
   - Cache control abstraction
   - Headers compatibility
   - TLS/Security metadata

3. **Low Priority** (Platform-specific):
   - Cloudflare Image Resizing
   - Fastly advanced caching (VCL-like)
   - Bot management features

### Testing Strategy

```javascript
// Mock platform for testing
global.__PLATFORM__ = 'fastly'; // or 'cloudflare'

// Test both code paths
describe('UnifiedRequest', () => {
  ['fastly', 'cloudflare'].forEach(platform => {
    describe(`on ${platform}`, () => {
      beforeEach(() => {
        global.__PLATFORM__ = platform;
      });

      it('should normalize cache key', () => {
        const req = new UnifiedRequest('https://example.com', {
          cacheKey: 'test-key'
        });
        // Verify platform-specific option is set correctly
      });
    });
  });
});
```

---

## Implementation Recommendations

Based on the helix-universal adapter pattern (see [PR #426](https://github.com/adobe/helix-universal/pull/426)), here are recommendations for implementing Request/Response/Fetch APIs in an edge deployment plugin:

### Edge Wrapper Implementation

The following functionality should be **built into the edge wrapper itself** as core adapter features:

1. **Handler Pattern Normalization** ✅ **Edge Wrapper**
   - Convert between Fastly's `addEventListener('fetch', ...)` and Cloudflare's `export default { fetch }`
   - Create unified `UnifiedContext` object similar to helix-universal's `context`
   - Standardize event/context parameters across platforms
   - **Rationale**: This is foundational infrastructure that must be consistent across all edge functions

2. **Request/Response Wrapping** ✅ **Edge Wrapper**
   - Basic Request/Response object handling (already Web Standard)
   - Platform detection and initialization
   - Error handling and logging integration
   - **Rationale**: Core HTTP primitives should be transparent to function authors

3. **Backend/Origin Selection** ✅ **Edge Wrapper**
   - Unified `fetch()` wrapper that handles platform-specific backend routing
   - Backend registry and configuration management
   - **Rationale**: Backend routing is platform-specific and should be abstracted by the wrapper

### Plugin Implementation

The following functionality should be implemented as **optional plugins** that can be composed:

1. **Request Metadata Enhancement** 🔌 **Plugin**
   - Geolocation data normalization (wrap `event.client.geo` vs `request.cf`)
   - Client metadata extraction and standardization
   - TLS/security metadata enrichment
   - **Rationale**: Not all functions need this data; plugins can opt-in
   - **Example**: `@adobe/helix-edge-geo` plugin adds `context.geo` with unified interface

2. **Cache Control** 🔌 **Plugin**
   - Cache key customization and normalization
   - TTL management across platforms
   - Surrogate key handling (Fastly) and Cache-Tags (Cloudflare)
   - **Rationale**: Caching strategies vary by application; should be composable
   - **Example**: `@adobe/helix-edge-cache` plugin provides unified cache control

3. **Headers Manipulation** 🔌 **Plugin**
   - Standard header transformations (security headers, CORS, etc.)
   - Header validation and sanitization
   - **Rationale**: Header policies are application-specific
   - **Example**: `@adobe/helix-shared-headers` plugin for common header operations

### Import/Polyfill Implementation

The following functionality should be provided as **imports or polyfills**:

1. **Standard Web APIs** 📦 **Import**
   - `Request`, `Response`, `Headers`, `URL`, `URLSearchParams`
   - These are already Web Standard APIs available on both platforms
   - **Rationale**: No abstraction needed; use platform natives
   - **Example**: Direct usage without wrappers

2. **Fetch Enhancements** 📦 **Import**
   - `@adobe/fetch` for enhanced fetch capabilities
   - Retry logic, timeout handling, connection pooling
   - **Rationale**: Application-level concerns, not platform abstraction
   - **Example**: Import and use directly in function code

3. **Body Parsing** 📦 **Import**
   - JSON/form data/multipart parsing
   - **Rationale**: Standard functionality, should be library-based
   - **Example**: Similar to helix-universal's `@adobe/helix-shared-body-data`

### Context Object Design

Following helix-universal's pattern, the edge wrapper should provide a `UnifiedContext` object with:

```javascript
interface UnifiedContext {
  // Platform information (wrapper)
  runtime: {
    name: 'fastly' | 'cloudflare';
    region: string;
  };

  // Function metadata (wrapper)
  func: {
    name: string;
    version: string;
    package: string;
  };

  // Invocation details (wrapper)
  invocation: {
    id: string;
    deadline: number;
    requestId: string;
  };

  // Environment variables (wrapper)
  env: Record<string, string>;

  // Logger (wrapper/plugin)
  log: Logger;

  // Attributes for plugin data (wrapper)
  attributes: Record<string, any>;

  // Geo data (plugin: @adobe/helix-edge-geo)
  geo?: UnifiedGeo;

  // Cache control (plugin: @adobe/helix-edge-cache)
  cache?: UnifiedCache;

  // Storage (plugin: @adobe/helix-edge-storage)
  storage?: UnifiedStorage;
}
```

### Composability Pattern

Similar to helix-universal's `wrap().with(plugin)` pattern, the edge wrapper should support:

```javascript
import { edge } from '@adobe/helix-deploy-plugin-edge';
import geoPlugin from '@adobe/helix-edge-geo';
import cachePlugin from '@adobe/helix-edge-cache';

export const handler = edge
  .with(geoPlugin)
  .with(cachePlugin, { ttl: 3600 })
  .wrap(async (request, context) => {
    // context.geo - from plugin
    // context.cache - from plugin
    return new Response('Hello from ' + context.geo.countryCode);
  });
```

---

## Additional Resources

### Fastly Documentation
- Request: https://js-compute-reference-docs.edgecompute.app/docs/globals/Request
- Response: https://js-compute-reference-docs.edgecompute.app/docs/globals/Response
- fetch: https://js-compute-reference-docs.edgecompute.app/docs/globals/fetch
- Headers: https://js-compute-reference-docs.edgecompute.app/docs/globals/Headers
- FetchEvent: https://js-compute-reference-docs.edgecompute.app/docs/globals/FetchEvent
- Backend: https://js-compute-reference-docs.edgecompute.app/docs/fastly:backend/Backend
- Geolocation: https://js-compute-reference-docs.edgecompute.app/docs/fastly:geolocation/getGeolocationForIpAddress

### Cloudflare Documentation
- Request: https://developers.cloudflare.com/workers/runtime-apis/request/
- Response: https://developers.cloudflare.com/workers/runtime-apis/response/
- Fetch: https://developers.cloudflare.com/workers/runtime-apis/fetch/
- Headers: https://developers.cloudflare.com/workers/runtime-apis/headers/
- Fetch Handler: https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/
- Context: https://developers.cloudflare.com/workers/runtime-apis/context/

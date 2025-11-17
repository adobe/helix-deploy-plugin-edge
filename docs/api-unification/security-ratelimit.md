# Security and Rate Limiting APIs: Fastly Compute vs Cloudflare Workers

This document analyzes the security, rate limiting, access control, and cache purging APIs available in both Fastly Compute and Cloudflare Workers, focusing on compatibility, differences, and unification strategies.

## Executive Summary

Rate limiting and security APIs are largely platform-specific with different design philosophies. Fastly provides built-in edge rate limiting with penalty boxes and ACL lookup capabilities directly in the runtime. Cloudflare uses binding-based rate limiting with configuration-driven limits and relies on Cache-Tags for purging. Cache invalidation approaches differ significantly: Fastly uses surrogate keys with instant purge from Workers, while Cloudflare uses Cache-Tags with API-based purging.

---

## Edge Rate Limiting

### Fastly: EdgeRateLimiter

| Property | Details |
|----------|---------|
| **Platform** | Fastly Compute |
| **Module** | `fastly:edge-rate-limiter` |
| **Purpose** | Built-in rate limiting with penalty box enforcement at the edge |
| **Availability** | Native runtime feature |

#### Key Classes

##### RateCounter
```javascript
import { RateCounter } from 'fastly:edge-rate-limiter';
const rc = new RateCounter('my-counter');
```

**Constructor Parameters:**
- `name` (string): Identifier for the rate counter

**Methods:**
- `increment(entry, delta)`: Increment counter for an entry
- `lookupRate(entry, window)`: Get current rate for an entry

##### PenaltyBox
```javascript
import { PenaltyBox } from 'fastly:edge-rate-limiter';
const pb = new PenaltyBox('my-penalty-box');
```

**Constructor Parameters:**
- `name` (string): Identifier for the penalty box

**Methods:**
- `add(entry, ttl)`: Add entry to penalty box
- `has(entry)`: Check if entry is in penalty box

##### EdgeRateLimiter
```javascript
import { RateCounter, PenaltyBox, EdgeRateLimiter } from 'fastly:edge-rate-limiter';

const rc = new RateCounter('rc');
const pb = new PenaltyBox('pb');
const limiter = new EdgeRateLimiter(rc, pb);
```

**Constructor Parameters:**
- `rateCounter` (RateCounter): Rate counter instance
- `penaltyBox` (PenaltyBox): Penalty box instance

**Key Method: checkRate()**
```javascript
const shouldBlock = limiter.checkRate(
  clientIP,    // entry: client identifier (e.g., IP address)
  1,           // delta: request count increment
  10,          // window: time window in seconds (1, 10, or 60)
  100,         // limit: max requests per second over window
  1            // penalty: TTL in minutes if limit exceeded
);
```

**Parameters:**
1. `entry` (string): Client identifier (IP, API key, user ID)
2. `delta` (number): Number of requests this execution counts as
3. `window` (number): Time window in seconds (must be 1, 10, or 60)
4. `limit` (number): Maximum average requests per second
5. `penalty` (number): Duration in minutes to block if exceeded

**Returns:** `boolean` - `true` if client should be blocked

#### Complete Usage Example
```javascript
import { RateCounter, PenaltyBox, EdgeRateLimiter } from 'fastly:edge-rate-limiter';

const rc = new RateCounter('rate_counter');
const pb = new PenaltyBox('penalty_box');
const limiter = new EdgeRateLimiter(rc, pb);

async function handleRequest(request) {
  const clientIP = request.headers.get('fastly-client-ip');

  // Check rate: 100 req/s over 10 second window, 1 minute penalty
  const blocked = limiter.checkRate(clientIP, 1, 10, 100, 1);

  if (blocked) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  return new Response('Success');
}
```

**Documentation:** https://js-compute-reference-docs.edgecompute.app/docs/fastly:edge-rate-limiter/EdgeRateLimiter/

---

### Cloudflare: Rate Limiting Binding

| Property | Details |
|----------|---------|
| **Platform** | Cloudflare Workers |
| **Access** | Environment binding |
| **Purpose** | Configuration-driven rate limiting with eventual consistency |
| **Availability** | Generally Available (September 2025) |

#### Configuration (wrangler.toml)
```toml
[[ratelimits]]
name = "MY_RATE_LIMITER"
namespace_id = "1001"
simple = { limit = 100, period = 60 }
```

**Configuration Parameters:**
- `name` (string): Binding name accessible in Worker
- `namespace_id` (number): Unique positive integer per account
- `limit` (number): Request threshold within period
- `period` (number): Window duration in seconds (must be 10 or 60)

#### API Method: limit()

```javascript
const { success } = await env.MY_RATE_LIMITER.limit({ key: pathname });
```

**Parameters:**
- `key` (string): Identifier for rate limiting scope

**Returns:** `{ success: boolean }`
- `success: true` - Request allowed
- `success: false` - Rate limit exceeded

#### Complete Usage Example
```javascript
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const { success } = await env.MY_RATE_LIMITER.limit({ key: pathname });

    if (!success) {
      return new Response('429 Failure - rate limit exceeded', { status: 429 });
    }

    return new Response('Success!');
  }
};
```

#### Key Design Characteristics

- **Locality**: Limits are enforced per Cloudflare edge location independently
- **Performance**: Counters cached locally with async background updates
- **Consistency**: Eventually consistent, permissive by design
- **Key Recommendations**: Use API keys, user IDs, tenant IDs, or URL routes
- **Avoid**: IP addresses or geographic locations (may be shared)

**Requirements:** Wrangler CLI version 4.36.0 or later

**Documentation:** https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

---

### Rate Limiting Comparison

| Feature | Fastly | Cloudflare |
|---------|--------|------------|
| **Configuration** | Runtime instantiation | wrangler.toml binding |
| **Rate Windows** | 1s, 10s, 60s | 10s, 60s |
| **Penalty Enforcement** | Built-in penalty box | Manual implementation |
| **Consistency** | Distributed counters | Eventually consistent per-location |
| **Return Type** | Boolean (block/allow) | Object with success property |
| **Async** | Synchronous | Async (Promise) |
| **Granularity** | Per request control | Configuration-based |

### Unification Strategy

1. **Abstraction Layer**: Create a unified `RateLimiter` interface
   ```javascript
   interface UnifiedRateLimiter {
     checkRate(key: string, options?: RateLimitOptions): Promise<boolean>;
   }
   ```

2. **Configuration Mapping**:
   - Fastly: Map to constructor parameters at runtime
   - Cloudflare: Require wrangler.toml configuration

3. **Penalty Box Behavior**:
   - Fastly: Native support
   - Cloudflare: Implement using KV or Durable Objects for penalty tracking

4. **Window Normalization**: Support only common windows (10s, 60s) for portability

---

## Access Control Lists (ACL)

### Fastly: ACL API

| Property | Details |
|----------|---------|
| **Platform** | Fastly Compute |
| **Module** | `fastly:acl` |
| **Purpose** | IP-based access control with subnet matching |
| **Availability** | Native runtime feature |

#### Key Methods

##### Acl.open()
```javascript
import { Acl } from 'fastly:acl';
const myAcl = Acl.open('my-acl-name');
```

**Parameters:**
- `name` (string): Name of the ACL to open

**Returns:** `Acl` instance

##### acl.lookup()
```javascript
const match = await myAcl.lookup(ipAddress);
```

**Parameters:**
- `ipAddress` (string): IPv4 or IPv6 address to check

**Returns:** Object containing:
- `action` (string): `'ALLOW'` or `'BLOCK'`
- `prefix` (string): Matching IP prefix from ACL

#### Complete Usage Example
```javascript
import { Acl } from 'fastly:acl';

async function handleRequest(event) {
  const myAcl = Acl.open('blocked-ips');
  const clientIP = event.client.address;

  const match = await myAcl.lookup(clientIP);

  if (match?.action === 'BLOCK') {
    return new Response('Access denied', { status: 403 });
  }

  return new Response('Welcome');
}
```

#### ACL Features

- **Subnet Matching**: Supports CIDR notation (e.g., `192.168.0.0/16`, `FD00::/7`)
- **IPv4 and IPv6**: Full support for both address families
- **Read-Only at Runtime**: ACLs are configured via API and attached to services
- **Global Consistency**: Entries proactively pushed to all Fastly POPs
- **High Performance**: Optimized for edge read operations

**Documentation:** https://js-compute-reference-docs.edgecompute.app/docs/fastly:acl/Acl/open

---

### Cloudflare: No Native ACL API

Cloudflare Workers does not have a built-in ACL API equivalent to Fastly's. IP-based access control must be implemented manually.

#### Manual Implementation Options

##### 1. Using KV Store
```javascript
export default {
  async fetch(request, env) {
    const clientIP = request.headers.get('CF-Connecting-IP');
    const blocked = await env.BLOCKED_IPS.get(clientIP);

    if (blocked) {
      return new Response('Access denied', { status: 403 });
    }

    return new Response('Welcome');
  }
};
```

##### 2. Using Firewall Rules (Dashboard)
Cloudflare provides IP Access Rules and Firewall Rules configured via dashboard or API, but these operate outside the Worker runtime.

##### 3. Using Cloudflare Access (Enterprise)
For enterprise customers, Cloudflare Access provides identity-based access control.

---

### ACL Comparison

| Feature | Fastly | Cloudflare |
|---------|--------|------------|
| **Native API** | Yes (`fastly:acl`) | No |
| **Subnet Matching** | Built-in CIDR support | Manual implementation |
| **Configuration** | Via Fastly API | KV, D1, or external |
| **Performance** | Optimized edge lookup | Depends on implementation |
| **IPv6 Support** | Native | Manual |

### Unification Strategy

1. **Abstraction Layer**:
   ```javascript
   interface UnifiedAcl {
     lookup(ipAddress: string): Promise<{ action: 'ALLOW' | 'BLOCK', prefix?: string }>;
   }
   ```

2. **Cloudflare Implementation**:
   - Use KV Store with IP range encoding
   - Implement CIDR matching in JavaScript
   - Consider using D1 for complex queries

3. **Portable Polyfill**:
   ```javascript
   // For Cloudflare, implement CIDR matching
   function ipInCidr(ip, cidr) {
     // Implementation for subnet matching
   }
   ```

---

## Cache Purging / Invalidation

### Fastly: purgeSurrogateKey

| Property | Details |
|----------|---------|
| **Platform** | Fastly Compute |
| **Module** | `fastly:compute` |
| **Purpose** | Instantly purge cached content by surrogate key |
| **Availability** | Native runtime feature |

#### Function Signature
```javascript
import { purgeSurrogateKey } from 'fastly:compute';

purgeSurrogateKey(surrogateKey, options);
```

**Parameters:**
- `surrogateKey` (string): The surrogate key to purge
- `options` (object, optional):
  - `soft` (boolean): Enable soft purge (default: `false`)

**Returns:** `undefined`

#### Purge Types

##### Hard Purge (Default)
```javascript
purgeSurrogateKey('product-123');
```
Immediately removes all cached items matching the surrogate key.

##### Soft Purge
```javascript
purgeSurrogateKey('product-123', { soft: true });
```
Marks content as stale while retaining it in cache, reducing origin load and enabling stale-while-revalidate.

#### Setting Surrogate Keys
```javascript
// Set surrogate key on response
const response = await fetch(backend);
response.headers.set('Surrogate-Key', 'product-123 category-electronics');
return response;
```

#### Complete Usage Example
```javascript
import { purgeSurrogateKey } from 'fastly:compute';

async function handlePurgeRequest(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (request.method === 'PURGE' && key) {
    // Soft purge to reduce origin load
    purgeSurrogateKey(key, { soft: true });
    return new Response(`Purged: ${key}`, { status: 200 });
  }

  return new Response('Invalid request', { status: 400 });
}
```

**Documentation:** https://js-compute-reference-docs.edgecompute.app/docs/fastly:compute/purgeSurrogateKey

---

### Cloudflare: Cache-Tag Purging

| Property | Details |
|----------|---------|
| **Platform** | Cloudflare Workers |
| **Access** | External API call or Cache API |
| **Purpose** | Tag-based cache invalidation |
| **Availability** | Enterprise feature (tag purging) |

#### Setting Cache-Tags in Workers
```javascript
export default {
  async fetch(request, env) {
    const response = await fetch(request);
    const newResponse = new Response(response.body, response);

    // Add cache tags for later purging
    newResponse.headers.append('Cache-Tag', 'product-123');
    newResponse.headers.append('Cache-Tag', 'category-electronics');

    return newResponse;
  }
};
```

#### Cache API (Local Data Center Only)

```javascript
// Delete from cache (local DC only)
const cache = caches.default;
await cache.delete(request);
```

**Limitation:** `cache.delete()` only purges content in the invoking data center.

#### Global Purge via API
```bash
curl https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -d '{
    "tags": ["product-123", "category-electronics"]
  }'
```

#### Purge via Worker (API Call)
```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const tag = url.searchParams.get('tag');

    if (request.method === 'PURGE' && tag) {
      const purgeResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${env.ZONE_ID}/purge_cache`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.CF_API_TOKEN}`
          },
          body: JSON.stringify({ tags: [tag] })
        }
      );

      return purgeResponse;
    }

    return new Response('Invalid request', { status: 400 });
  }
};
```

#### Cache-Tag Specifications

- **Minimum Length**: 1 byte
- **Maximum per Request**: ~1,000 tags (16 KB header limit)
- **Maximum per API Call**: 30 tags
- **API Rate Limit**: 30,000 purge calls per 24 hours
- **Case Sensitivity**: Not case-sensitive

**Documentation:**
- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/

---

### Cache Purging Comparison

| Feature | Fastly | Cloudflare |
|---------|--------|------------|
| **Method** | Direct function call | API call or local cache.delete() |
| **Scope** | Global (all POPs) | Local (cache.delete) or Global (API) |
| **Tag Naming** | Surrogate-Key header | Cache-Tag header |
| **Soft Purge** | Native support | Requires origin cooperation |
| **Speed** | Instant from Worker | <150ms (API-based) |
| **Rate Limits** | None documented | 30,000/day for tag purges |
| **Plan Requirements** | All plans | Enterprise (tag purging) |

### Unification Strategy

1. **Abstraction Layer**:
   ```javascript
   interface UnifiedCachePurge {
     purgeByTag(tag: string, options?: PurgeOptions): Promise<void>;
     setTag(response: Response, tag: string): Response;
   }
   ```

2. **Tag Header Normalization**:
   ```javascript
   // Set appropriate header based on platform
   function setTag(response, tag) {
     if (isFastly) {
       response.headers.append('Surrogate-Key', tag);
     } else {
       response.headers.append('Cache-Tag', tag);
     }
     return response;
   }
   ```

3. **Purge Implementation**:
   - Fastly: Direct `purgeSurrogateKey()` call
   - Cloudflare: API call with appropriate credentials

4. **Considerations**:
   - Cloudflare tag purging requires Enterprise plan
   - Cloudflare requires API credentials in Worker environment
   - Fastly has instant purge from Worker context

---

## Security Headers

Both platforms support setting security headers via standard Response API.

### Common Security Headers
```javascript
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=()'
};

// Works on both platforms
const response = new Response(body, {
  headers: securityHeaders
});
```

**Documentation:**
- Cloudflare: https://developers.cloudflare.com/workers/examples/security-headers/
- Fastly: Standard Response API

---

## Platform-Specific Security Features

### Fastly-Only Features

1. **EdgeRateLimiter with Penalty Box**: Automatic blocking of abusive clients
2. **ACL Lookup**: Native subnet-based IP filtering
3. **Instant Surrogate Key Purge**: Direct cache invalidation from Worker

### Cloudflare-Only Features

1. **WAF Integration**: Workers can interact with Cloudflare WAF rules
2. **Bot Management**: Integration with Bot Management services
3. **DDoS Protection**: Automatic DDoS mitigation at network edge
4. **Cloudflare Access**: Zero-trust security policies

---

## Recommendations for Unified Development

### 1. Rate Limiting
- Use abstraction layer with platform-specific implementations
- Standardize on 10s or 60s windows for compatibility
- Implement penalty box tracking with KV on Cloudflare

### 2. Access Control
- Implement CIDR matching utility for Cloudflare
- Use KV or D1 for storing ACL rules on Cloudflare
- Provide Fastly ACL wrapper for consistency

### 3. Cache Purging
- Abstract tag setting and purging operations
- Handle Enterprise feature requirements for Cloudflare
- Document rate limits and plan requirements

### 4. Security Headers
- Use standard Response API (fully compatible)
- Create header policy objects for reusability
- Test CSP policies on both platforms

---

## Documentation Links

### Fastly Compute
- Edge Rate Limiter: https://js-compute-reference-docs.edgecompute.app/docs/fastly:edge-rate-limiter/EdgeRateLimiter/
- RateCounter: https://js-compute-reference-docs.edgecompute.app/docs/fastly:edge-rate-limiter/RateCounter/
- PenaltyBox: https://js-compute-reference-docs.edgecompute.app/docs/fastly:edge-rate-limiter/PenaltyBox/
- ACL: https://js-compute-reference-docs.edgecompute.app/docs/fastly:acl/Acl/open
- purgeSurrogateKey: https://js-compute-reference-docs.edgecompute.app/docs/fastly:compute/purgeSurrogateKey
- Rate Limiting Guide: https://www.fastly.com/documentation/guides/concepts/rate-limiting/

### Cloudflare Workers
- Rate Limiting Binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Cache API: https://developers.cloudflare.com/workers/runtime-apis/cache/
- Cache-Tag Purging: https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/
- Security Headers: https://developers.cloudflare.com/workers/examples/security-headers/
- Cache Purge API: https://developers.cloudflare.com/api/resources/cache/methods/purge/

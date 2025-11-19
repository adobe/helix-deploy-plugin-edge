# CacheOverride API Demo

This fixture demonstrates the cross-platform `CacheOverride` API for cache control on both Fastly Compute and Cloudflare Workers.

## Routes

### Info Page
- **URL**: `/cache-demo/`
- **Description**: Returns API information and available routes

### Long Cache
- **URL**: `/cache-demo/long`
- **Cache**: 1 hour TTL
- **Surrogate Key**: `cache-demo long-cache`
- **Use Case**: Static content that rarely changes

### Short Cache
- **URL**: `/cache-demo/short`
- **Cache**: 10 seconds TTL
- **Surrogate Key**: `cache-demo short-cache`
- **Use Case**: Frequently updated content

### No Cache
- **URL**: `/cache-demo/no-cache`
- **Cache**: Disabled (pass mode)
- **Use Case**: Always-fresh, dynamic content

### Custom Cache Key
- **URL**: `/cache-demo/custom`
- **Cache**: 5 minutes TTL with custom cache key based on User-Agent
- **Surrogate Key**: `cache-demo custom-key`
- **Use Case**: Per-client caching strategies

## Testing

Each route fetches a UUID from `httpbin.org/uuid` and returns:
- The UUID (should be the same for cached responses)
- Timestamp
- Runtime information
- Cache configuration
- Response headers

To test caching:
1. Call `/cache-demo/short` multiple times quickly - should return the same UUID
2. Wait 10 seconds and call again - should return a new UUID
3. Call `/cache-demo/no-cache` - should always return a new UUID

## Backend

Uses `httpbin.org` as a test backend:
- **Endpoint**: `/uuid` - Returns a unique identifier
- **Purpose**: Easy way to verify cache hits (same UUID) vs cache misses (new UUID)

## Example Response

```json
{
  "description": "Short cache (10 seconds)",
  "timestamp": "2025-11-19T22:50:00.000Z",
  "runtime": "cloudflare-workers",
  "backend": {
    "url": "https://httpbin.org/uuid",
    "status": 200,
    "data": {
      "uuid": "12345678-1234-1234-1234-123456789abc"
    }
  },
  "cache": {
    "mode": "override",
    "options": {
      "ttl": 10,
      "surrogateKey": "cache-demo short-cache"
    }
  },
  "headers": {
    "cache-control": "public, max-age=10",
    "age": "5",
    "x-cache": "HIT"
  }
}
```

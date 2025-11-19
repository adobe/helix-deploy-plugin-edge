# API Documentation

## CacheOverride

The `CacheOverride` class provides a unified API for controlling cache behavior across both Fastly Compute and Cloudflare Workers platforms.

### Import

```javascript
import { CacheOverride, fetch } from '@adobe/fetch';
```

### Constructor

#### `new CacheOverride(mode, init)`

Creates a new CacheOverride instance with the specified mode and options.

**Parameters:**

- `mode` (string): Cache override mode. One of:
  - `"none"`: Respect origin cache control headers (default behavior)
  - `"pass"`: Prevent caching regardless of origin headers
  - `"override"`: Apply custom cache settings
- `init` (object, optional): Cache configuration options

**Alternative Signature:**

#### `new CacheOverride(init)`

Creates a new CacheOverride instance with `"override"` mode and the specified options.

**Parameters:**

- `init` (object): Cache configuration options

### Cross-Platform Options

The CacheOverride API only includes options that work on **both** Fastly and Cloudflare platforms to ensure true cross-platform compatibility:

| Option | Type | Description | Platform Mapping |
|--------|------|-------------|------------------|
| `ttl` | number | Time-to-live in seconds | Fastly: native `ttl`<br>Cloudflare: `cf.cacheTtl` |
| `cacheKey` | string | Custom cache key | Fastly: native `cacheKey`<br>Cloudflare: `cf.cacheKey` |
| `surrogateKey` | string | Space-separated surrogate keys for cache purging | Fastly: native `surrogateKey`<br>Cloudflare: `cf.cacheTags` (array) |

**Note:** Platform-specific options (like Fastly's `swr`, `pci`, `beforeSend`, `afterSend`) are intentionally excluded to maintain cross-platform compatibility. If you pass unsupported options, they will be ignored with a console warning.

### Usage Examples

#### Basic TTL Override

```javascript
import { fetch, CacheOverride } from '@adobe/fetch';

const cacheOverride = new CacheOverride('override', {
  ttl: 3600  // Cache for 1 hour
});

const response = await fetch('https://example.com/api', {
  cacheOverride
});
```

#### Prevent Caching

```javascript
const cacheOverride = new CacheOverride('pass');

const response = await fetch('https://example.com/api', {
  cacheOverride
});
```

#### Advanced Configuration

```javascript
const cacheOverride = new CacheOverride({
  ttl: 3600,              // Cache for 1 hour
  cacheKey: 'my-key',     // Custom cache key
  surrogateKey: 'api v1'  // Surrogate keys for purging
});

const response = await fetch('https://example.com/api', {
  cacheOverride
});
```

#### Conditional Caching by Path

```javascript
import { fetch, CacheOverride } from '@adobe/fetch';

export async function main(request, context) {
  const url = new URL(request.url);
  let cacheOverride;

  if (url.pathname.startsWith('/static/')) {
    // Long cache for static resources
    cacheOverride = new CacheOverride({ ttl: 86400 });
  } else if (url.pathname === '/') {
    // Short cache for homepage
    cacheOverride = new CacheOverride({ ttl: 60 });
  } else {
    // Respect origin cache headers
    cacheOverride = new CacheOverride('none');
  }

  return fetch(url, { cacheOverride });
}
```

### Platform-Specific Behavior

#### Fastly Compute

On Fastly, `CacheOverride` uses the native `fastly:cache-override` module. Only cross-platform compatible options are passed through to ensure consistent behavior.

```javascript
// On Fastly, this uses native CacheOverride with cross-platform options
const override = new CacheOverride('override', {
  ttl: 3600,
  cacheKey: 'my-key',
  surrogateKey: 'homepage main'
});
```

#### Cloudflare Workers

On Cloudflare, `CacheOverride` options are automatically mapped to the `cf` object in fetch options:

| CacheOverride | Cloudflare cf object |
|---------------|---------------------|
| `mode: "pass"` | `cf: { cacheTtl: 0 }` |
| `mode: "none"` | No cf options added |
| `ttl: 3600` | `cf: { cacheTtl: 3600 }` |
| `cacheKey: "key"` | `cf: { cacheKey: "key" }` |
| `surrogateKey: "a b"` | `cf: { cacheTags: ["a", "b"] }` |

```javascript
// On Cloudflare, this is converted to:
// fetch(url, { cf: { cacheTtl: 3600, cacheKey: 'my-key', cacheTags: ['api', 'v1'] } })
const override = new CacheOverride({
  ttl: 3600,
  cacheKey: 'my-key',
  surrogateKey: 'api v1'
});

await fetch(url, { cacheOverride: override });
```

### Notes

- **Cross-Platform Compatibility**: Only options supported on both platforms are included in this API
- **Unsupported Options**: If you pass platform-specific options (like `swr`, `pci`, `beforeSend`, `afterSend`), they will be ignored with a console warning
- **Cloudflare Enterprise**: The `cacheKey` feature requires a Cloudflare Enterprise plan
- **Surrogate Keys**: On Cloudflare, the space-separated `surrogateKey` string is automatically split into an array for `cf.cacheTags`
- **For Platform-Specific Features**: If you need platform-specific cache features, use platform detection and native APIs directly instead of the cross-platform `CacheOverride` API

# Environment, Geolocation, and Device Detection API Unification

This document analyzes the Environment, Geolocation, and Device Detection APIs for Fastly Compute and Cloudflare Workers, providing a comprehensive unification strategy.

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Geolocation Data](#geolocation-data)
3. [Device Detection](#device-detection)
4. [Runtime Context](#runtime-context)
5. [Unified API Design](#unified-api-design)
6. [Adapter Implementation](#adapter-implementation)

---

## Environment Variables

### Fastly Compute: `fastly:env`

**Platform**: Fastly Compute
**Purpose**: Access environment variables at runtime
**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:env/env

#### API

```javascript
import { env } from "fastly:env";

// Get environment variable value
const value = env("VARIABLE_NAME"); // Returns string (empty string if not found)
```

#### Key Properties/Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `env()` | `env(name: string): string` | Retrieves environment variable by name |

#### Built-in Variables

- `FASTLY_HOSTNAME` - Current hostname
- `FASTLY_TRACE_ID` - Request trace ID
- See: https://developer.fastly.com/reference/compute/ecp-env/

#### Constraints

- **Runtime Only**: Cannot be called during build-time initialization
- Must be invoked within request handlers
- Returns empty string for undefined variables

---

### Cloudflare Workers: Environment Bindings

**Platform**: Cloudflare Workers
**Purpose**: Access environment variables, secrets, and service bindings
**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/bindings/

#### API

```javascript
// Method 1: Handler parameter
export default {
  async fetch(request, env, ctx) {
    return new Response(`Value: ${env.MY_VARIABLE}`);
  }
};

// Method 2: Import from cloudflare:workers
import { env } from "cloudflare:workers";
console.log(env.MY_VARIABLE);

// Method 3: Class property
export class MyDurableObject extends DurableObject {
  async myMethod() {
    return this.env.MY_VARIABLE;
  }
}
```

#### Key Properties/Methods

| Access Pattern | Description |
|----------------|-------------|
| `env.VARIABLE_NAME` | Direct property access on env object |
| `env` parameter | Passed to fetch handler |
| `this.env` | Class property in DurableObject/WorkerEntrypoint |
| `withEnv()` | Override env values temporarily |

#### Binding Types

- Environment Variables
- Secrets
- KV Namespace
- R2 Bucket
- D1 Database
- Durable Objects
- Service Bindings
- And 20+ more

#### Constraints

- Bindings defined in `wrangler.toml` or `wrangler.jsonc`
- I/O operations require request context
- Global scope caching can cause stale binding issues

---

### Cross-Platform Comparison: Environment

| Feature | Fastly Compute | Cloudflare Workers |
|---------|---------------|-------------------|
| Access Method | Function call `env("NAME")` | Property access `env.NAME` |
| Return Type | String (empty if undefined) | Any (undefined if not set) |
| Configuration | Fastly service config | wrangler.toml/jsonc |
| Runtime Only | Yes | Partial (env access OK, I/O needs context) |
| Type Safety | No | Yes (via TypeScript) |
| Binding Types | Environment variables only | 23+ binding types |

---

## Geolocation Data

### Fastly Compute: `fastly:geolocation`

**Platform**: Fastly Compute
**Purpose**: Retrieve geolocation data for IP addresses
**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:geolocation/getGeolocationForIpAddress

#### API

```javascript
import { getGeolocationForIpAddress } from "fastly:geolocation";

const geo = getGeolocationForIpAddress(clientIpAddress);
// Returns object with geolocation properties or null
```

#### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `as_name` | string \| null | Organization name for AS number |
| `as_number` | number \| null | Autonomous system number |
| `area_code` | number \| null | Telephone area code (US/Canada only) |
| `city` | string \| null | City or town name |
| `conn_speed` | string \| null | Connection speed classification |
| `conn_type` | string \| null | Connection type classification |
| `continent` | string \| null | Continental region (e.g., "NA") |
| `country_code` | string \| null | ISO 3166-1 alpha-2 code (e.g., "US") |
| `country_code3` | string \| null | ISO 3166-1 alpha-3 code (e.g., "USA") |
| `country_name` | string \| null | English country name |
| `gmt_offset` | string \| null | GMT offset for city |
| `latitude` | number \| null | Degrees from equator (-90 to +90) |
| `longitude` | number \| null | Degrees from meridian (-180 to +180) |
| `metro_code` | number \| null | US DMA code |
| `postal_code` | string \| null | Postal/ZIP code |
| `proxy_description` | string \| null | Client proxy details |
| `proxy_type` | string \| null | Client proxy classification |
| `region` | string \| null | ISO 3166-2 subdivision code |
| `utc_offset` | number \| null | UTC offset in seconds |

#### Constraints

- Runtime only (not during build-time initialization)
- Postal codes available for limited countries
- Returns `null` if no data exists for the IP

---

### Cloudflare Workers: `request.cf` Object

**Platform**: Cloudflare Workers
**Purpose**: Access request metadata including geolocation
**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties

#### API

```javascript
export default {
  async fetch(request, env, ctx) {
    const cf = request.cf;
    // Access geolocation and other metadata
    return new Response(`Country: ${cf.country}`);
  }
};
```

#### Geolocation Properties

| Property | Type | Description |
|----------|------|-------------|
| `asn` | number | Autonomous System Number |
| `asOrganization` | string | Organization owning the ASN |
| `city` | string \| null | City name |
| `colo` | string | IATA airport code of data center |
| `continent` | string \| null | Continent code (e.g., "NA") |
| `country` | string \| null | ISO 3166-1 alpha-2 country code |
| `isEUCountry` | string \| null | "1" if EU country |
| `latitude` | string \| null | Decimal latitude |
| `longitude` | string \| null | Decimal longitude |
| `metroCode` | string \| null | US DMA code |
| `postalCode` | string \| null | Postal/ZIP code |
| `region` | string \| null | ISO 3166-2 region name |
| `regionCode` | string \| null | ISO 3166-2 region code |
| `timezone` | string | IANA timezone identifier |

#### Additional `request.cf` Properties

| Property | Type | Description |
|----------|------|-------------|
| `httpProtocol` | string | HTTP protocol version |
| `tlsVersion` | string | TLS version |
| `tlsCipher` | string | TLS cipher suite |
| `tlsClientAuth` | object \| null | mTLS client certificate info |
| `clientAcceptEncoding` | string \| null | Original Accept-Encoding header |
| `requestPriority` | string \| null | Browser priority information |
| `botManagement` | object \| null | Bot detection data (requires Bot Management) |
| `hostMetadata` | object \| undefined | Custom hostname metadata |

#### Constraints

- Not available in Workers dashboard/playground preview
- Geolocation is automatically provided for request IP
- Some properties require specific Cloudflare features (Bot Management, mTLS)

---

### Cross-Platform Comparison: Geolocation

| Feature | Fastly Compute | Cloudflare Workers |
|---------|---------------|-------------------|
| Access Method | `getGeolocationForIpAddress(ip)` | `request.cf` |
| IP Input | Any IP address (parameter) | Request IP only (automatic) |
| Country Code | `country_code` (string) | `country` (string) |
| Country Name | `country_name` (string) | Not available |
| Country Code 3 | `country_code3` (string) | Not available |
| City | `city` (string) | `city` (string) |
| Latitude | `latitude` (number) | `latitude` (string) |
| Longitude | `longitude` (number) | `longitude` (string) |
| Continent | `continent` (string) | `continent` (string) |
| Region | `region` (string) | `regionCode` (string) |
| Region Name | Not available | `region` (string) |
| Postal Code | `postal_code` (string) | `postalCode` (string) |
| Metro Code | `metro_code` (number) | `metroCode` (string) |
| Timezone | `gmt_offset` + `utc_offset` | `timezone` (IANA) |
| ASN | `as_number` (number) | `asn` (number) |
| AS Org | `as_name` (string) | `asOrganization` (string) |
| EU Country | Not available | `isEUCountry` (string) |
| Connection Type | `conn_type` (string) | Not available |
| Connection Speed | `conn_speed` (string) | Not available |
| Proxy Info | `proxy_type`, `proxy_description` | Not available |
| Data Center | Not available | `colo` (IATA code) |
| TLS Info | Not available | Multiple TLS properties |

---

## Device Detection

### Fastly Compute: `fastly:device`

**Platform**: Fastly Compute
**Purpose**: Detect device characteristics from User-Agent
**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:device/Device/lookup

#### API

```javascript
import { Device } from "fastly:device";

const device = Device.lookup(userAgentString);
// Returns Device instance or null
```

#### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `brand` | string \| null | Device brand name |
| `model` | string \| null | Device model identifier |
| `name` | string \| null | Device name |
| `hardwareType` | string \| null | Hardware classification |
| `isDesktop` | boolean | Desktop device indicator |
| `isMobile` | boolean | Mobile device indicator |
| `isTablet` | boolean | Tablet device indicator |
| `isSmartTV` | boolean | Smart TV indicator |
| `isGameConsole` | boolean | Gaming console indicator |
| `isMediaPlayer` | boolean | Media player indicator |
| `isTouchscreen` | boolean | Touchscreen capability |
| `toJSON()` | method | JSON serialization |

#### Constraints

- Returns `null` if no data found for User-Agent
- Runtime only (not during build-time initialization)
- Requires User-Agent string input

---

### Cloudflare Workers: Device Detection

**Platform**: Cloudflare Workers
**Purpose**: No native device detection API
**Documentation**: N/A

#### Available Options

Cloudflare Workers does **not** provide a native device detection API. Options include:

1. **User-Agent Parsing Libraries**: Use third-party libraries (e.g., `ua-parser-js`)
2. **Client Hints**: Parse `Sec-CH-UA-*` headers
3. **Bot Management**: `request.cf.botManagement` provides some client information

```javascript
// Example with ua-parser-js (requires bundling)
import UAParser from 'ua-parser-js';

export default {
  async fetch(request) {
    const parser = new UAParser(request.headers.get('user-agent'));
    const device = parser.getDevice();
    return new Response(JSON.stringify(device));
  }
};
```

---

### Cross-Platform Comparison: Device Detection

| Feature | Fastly Compute | Cloudflare Workers |
|---------|---------------|-------------------|
| Native API | Yes (`fastly:device`) | No |
| Device Type | `isDesktop`, `isMobile`, etc. | Third-party library |
| Brand/Model | `brand`, `model` | Third-party library |
| Built-in Database | Yes | No |
| Performance | Optimized at edge | Bundle size overhead |

---

## Runtime Context

### Fastly Compute: Event Context

**Platform**: Fastly Compute
**Purpose**: Request lifecycle management
**Documentation**: Based on Service Worker API

#### API

```javascript
addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
  event.waitUntil(asyncTask());
});

// Event properties
event.request       // Request object
event.client        // Client information
event.client.address // Client IP address
```

---

### Cloudflare Workers: Context (`ctx`)

**Platform**: Cloudflare Workers
**Purpose**: Worker and request lifecycle management
**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/context/

#### API

```javascript
export default {
  async fetch(request, env, ctx) {
    // Non-blocking async work
    ctx.waitUntil(analytics.track(request));

    // Fail-open pattern
    ctx.passThroughOnException();

    // Access exports (requires compatibility flag)
    await ctx.exports.ServiceName.method();

    // Access props from service bindings
    const config = ctx.props;

    return new Response('OK');
  }
};
```

#### Key Properties/Methods

| Property/Method | Description |
|-----------------|-------------|
| `ctx.waitUntil(promise)` | Extend worker lifetime for async operations |
| `ctx.passThroughOnException()` | Pass to origin on unhandled exceptions |
| `ctx.props` | Configuration from service binding caller |
| `ctx.exports` | Loopback service bindings (requires flag) |

---

### Cross-Platform Comparison: Runtime Context

| Feature | Fastly Compute | Cloudflare Workers |
|---------|---------------|-------------------|
| Handler Pattern | `addEventListener("fetch", ...)` | `export default { fetch(...) }` |
| Async Continuation | `event.waitUntil()` | `ctx.waitUntil()` |
| Fail-Open | Not built-in | `ctx.passThroughOnException()` |
| Client IP | `event.client.address` | `request.headers.get('cf-connecting-ip')` |
| Service Context | Not available | `ctx.props` |

---

## Unified API Design

### Proposed Unified Interface

```typescript
// unified-edge-runtime.d.ts

interface UnifiedEnv {
  get(name: string): string | undefined;
  has(name: string): boolean;
  getAll(): Record<string, string>;
}

interface UnifiedGeolocation {
  country: string | null;
  countryCode: string | null;
  countryCode3?: string | null;
  countryName?: string | null;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  continent: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  metroCode: string | null;
  asn: number | null;
  asOrganization: string | null;
  isEU?: boolean;
}

interface UnifiedDevice {
  type: 'desktop' | 'mobile' | 'tablet' | 'tv' | 'console' | 'unknown';
  brand: string | null;
  model: string | null;
  name: string | null;
  isTouchscreen: boolean;
  raw: Record<string, any>;
}

interface UnifiedContext {
  request: Request;
  env: UnifiedEnv;
  geo: UnifiedGeolocation;
  device: UnifiedDevice;
  waitUntil(promise: Promise<any>): void;
  clientIP: string;
}
```

---

## Adapter Implementation

### Environment Adapter

```typescript
// adapters/env.ts

// Fastly Adapter
class FastlyEnvAdapter implements UnifiedEnv {
  private envFn: (name: string) => string;

  constructor(envModule: { env: (name: string) => string }) {
    this.envFn = envModule.env;
  }

  get(name: string): string | undefined {
    const value = this.envFn(name);
    return value === '' ? undefined : value;
  }

  has(name: string): boolean {
    return this.envFn(name) !== '';
  }

  getAll(): Record<string, string> {
    // Not supported in Fastly - return empty object
    console.warn('getAll() not supported in Fastly Compute');
    return {};
  }
}

// Cloudflare Adapter
class CloudflareEnvAdapter implements UnifiedEnv {
  private envObj: Record<string, any>;

  constructor(env: Record<string, any>) {
    this.envObj = env;
  }

  get(name: string): string | undefined {
    const value = this.envObj[name];
    return typeof value === 'string' ? value : undefined;
  }

  has(name: string): boolean {
    return name in this.envObj;
  }

  getAll(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key in this.envObj) {
      if (typeof this.envObj[key] === 'string') {
        result[key] = this.envObj[key];
      }
    }
    return result;
  }
}

// Factory function
export function createEnvAdapter(platform: 'fastly' | 'cloudflare', source: any): UnifiedEnv {
  if (platform === 'fastly') {
    return new FastlyEnvAdapter(source);
  } else {
    return new CloudflareEnvAdapter(source);
  }
}
```

### Geolocation Adapter

```typescript
// adapters/geo.ts

// Fastly Adapter
class FastlyGeoAdapter {
  static fromIP(ip: string, geoModule: any): UnifiedGeolocation {
    const geo = geoModule.getGeolocationForIpAddress(ip);

    if (!geo) {
      return this.emptyGeo();
    }

    return {
      country: geo.country_code,
      countryCode: geo.country_code,
      countryCode3: geo.country_code3,
      countryName: geo.country_name,
      city: geo.city,
      region: geo.region,
      regionCode: geo.region,
      continent: geo.continent,
      postalCode: geo.postal_code,
      latitude: geo.latitude,
      longitude: geo.longitude,
      timezone: this.offsetToTimezone(geo.utc_offset),
      metroCode: geo.metro_code ? String(geo.metro_code) : null,
      asn: geo.as_number,
      asOrganization: geo.as_name,
      isEU: undefined, // Not available in Fastly
    };
  }

  private static offsetToTimezone(offset: number | null): string | null {
    // Fastly provides offset, not IANA timezone
    // This is a limitation - consider using a mapping
    return offset !== null ? `UTC${offset >= 0 ? '+' : ''}${offset / 3600}` : null;
  }

  private static emptyGeo(): UnifiedGeolocation {
    return {
      country: null,
      countryCode: null,
      city: null,
      region: null,
      regionCode: null,
      continent: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      timezone: null,
      metroCode: null,
      asn: null,
      asOrganization: null,
    };
  }
}

// Cloudflare Adapter
class CloudflareGeoAdapter {
  static fromRequest(cf: any): UnifiedGeolocation {
    if (!cf) {
      return this.emptyGeo();
    }

    return {
      country: cf.country || null,
      countryCode: cf.country || null,
      countryCode3: undefined, // Not available in Cloudflare
      countryName: undefined,  // Not available in Cloudflare
      city: cf.city || null,
      region: cf.region || null,
      regionCode: cf.regionCode || null,
      continent: cf.continent || null,
      postalCode: cf.postalCode || null,
      latitude: cf.latitude ? parseFloat(cf.latitude) : null,
      longitude: cf.longitude ? parseFloat(cf.longitude) : null,
      timezone: cf.timezone || null,
      metroCode: cf.metroCode || null,
      asn: cf.asn || null,
      asOrganization: cf.asOrganization || null,
      isEU: cf.isEUCountry === '1',
    };
  }

  private static emptyGeo(): UnifiedGeolocation {
    return {
      country: null,
      countryCode: null,
      city: null,
      region: null,
      regionCode: null,
      continent: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      timezone: null,
      metroCode: null,
      asn: null,
      asOrganization: null,
    };
  }
}

// Factory function
export function createGeoAdapter(
  platform: 'fastly' | 'cloudflare',
  source: any,
  ip?: string
): UnifiedGeolocation {
  if (platform === 'fastly') {
    if (!ip) throw new Error('IP address required for Fastly geolocation');
    return FastlyGeoAdapter.fromIP(ip, source);
  } else {
    return CloudflareGeoAdapter.fromRequest(source);
  }
}
```

### Device Detection Adapter

```typescript
// adapters/device.ts

// Fastly Adapter
class FastlyDeviceAdapter {
  static fromUserAgent(userAgent: string, deviceModule: any): UnifiedDevice {
    const device = deviceModule.Device.lookup(userAgent);

    if (!device) {
      return this.unknownDevice();
    }

    return {
      type: this.determineType(device),
      brand: device.brand,
      model: device.model,
      name: device.name,
      isTouchscreen: device.isTouchscreen || false,
      raw: device.toJSON ? device.toJSON() : device,
    };
  }

  private static determineType(device: any): UnifiedDevice['type'] {
    if (device.isDesktop) return 'desktop';
    if (device.isMobile) return 'mobile';
    if (device.isTablet) return 'tablet';
    if (device.isSmartTV) return 'tv';
    if (device.isGameConsole) return 'console';
    return 'unknown';
  }

  private static unknownDevice(): UnifiedDevice {
    return {
      type: 'unknown',
      brand: null,
      model: null,
      name: null,
      isTouchscreen: false,
      raw: {},
    };
  }
}

// Cloudflare Adapter (using simple heuristics)
class CloudflareDeviceAdapter {
  static fromUserAgent(userAgent: string): UnifiedDevice {
    const ua = userAgent.toLowerCase();

    const isMobile = /mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua);
    const isTablet = /tablet|ipad|playbook|silk/i.test(ua);
    const isTV = /smart-tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast.tv/i.test(ua);
    const isConsole = /playstation|xbox|nintendo/i.test(ua);

    let type: UnifiedDevice['type'] = 'desktop';
    if (isConsole) type = 'console';
    else if (isTV) type = 'tv';
    else if (isTablet) type = 'tablet';
    else if (isMobile) type = 'mobile';

    return {
      type,
      brand: this.extractBrand(ua),
      model: null, // Basic detection doesn't provide model
      name: null,
      isTouchscreen: isMobile || isTablet,
      raw: { userAgent },
    };
  }

  private static extractBrand(ua: string): string | null {
    if (ua.includes('iphone') || ua.includes('ipad')) return 'Apple';
    if (ua.includes('samsung')) return 'Samsung';
    if (ua.includes('huawei')) return 'Huawei';
    if (ua.includes('xiaomi')) return 'Xiaomi';
    if (ua.includes('pixel')) return 'Google';
    return null;
  }
}

// Factory function
export function createDeviceAdapter(
  platform: 'fastly' | 'cloudflare',
  userAgent: string,
  deviceModule?: any
): UnifiedDevice {
  if (platform === 'fastly') {
    if (!deviceModule) throw new Error('Device module required for Fastly');
    return FastlyDeviceAdapter.fromUserAgent(userAgent, deviceModule);
  } else {
    return CloudflareDeviceAdapter.fromUserAgent(userAgent);
  }
}
```

### Unified Context Factory

```typescript
// context.ts

import { createEnvAdapter, UnifiedEnv } from './adapters/env';
import { createGeoAdapter, UnifiedGeolocation } from './adapters/geo';
import { createDeviceAdapter, UnifiedDevice } from './adapters/device';

interface UnifiedContextOptions {
  platform: 'fastly' | 'cloudflare';
  request: Request;
  // Fastly-specific
  fastlyEnv?: any;
  fastlyGeo?: any;
  fastlyDevice?: any;
  fastlyEvent?: any;
  // Cloudflare-specific
  cloudflareEnv?: any;
  cloudflareCf?: any;
  cloudflareCtx?: any;
}

export function createUnifiedContext(options: UnifiedContextOptions): UnifiedContext {
  const { platform, request } = options;

  let env: UnifiedEnv;
  let geo: UnifiedGeolocation;
  let device: UnifiedDevice;
  let clientIP: string;
  let waitUntil: (promise: Promise<any>) => void;

  if (platform === 'fastly') {
    // Fastly implementation
    clientIP = options.fastlyEvent?.client?.address || '';
    env = createEnvAdapter('fastly', options.fastlyEnv);
    geo = createGeoAdapter('fastly', options.fastlyGeo, clientIP);
    device = createDeviceAdapter(
      'fastly',
      request.headers.get('user-agent') || '',
      options.fastlyDevice
    );
    waitUntil = (promise) => options.fastlyEvent?.waitUntil(promise);
  } else {
    // Cloudflare implementation
    clientIP = request.headers.get('cf-connecting-ip') || '';
    env = createEnvAdapter('cloudflare', options.cloudflareEnv);
    geo = createGeoAdapter('cloudflare', options.cloudflareCf);
    device = createDeviceAdapter(
      'cloudflare',
      request.headers.get('user-agent') || ''
    );
    waitUntil = (promise) => options.cloudflareCtx?.waitUntil(promise);
  }

  return {
    request,
    env,
    geo,
    device,
    waitUntil,
    clientIP,
  };
}
```

### Usage Examples

#### Fastly Compute Usage

```javascript
import { env } from "fastly:env";
import * as geoModule from "fastly:geolocation";
import * as deviceModule from "fastly:device";
import { createUnifiedContext } from "./context";

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const ctx = createUnifiedContext({
    platform: 'fastly',
    request: event.request,
    fastlyEnv: { env },
    fastlyGeo: geoModule,
    fastlyDevice: deviceModule,
    fastlyEvent: event,
  });

  // Use unified API
  const apiKey = ctx.env.get('API_KEY');
  const country = ctx.geo.country;
  const isMobile = ctx.device.type === 'mobile';

  ctx.waitUntil(logAnalytics(ctx));

  return new Response(JSON.stringify({
    country,
    isMobile,
    clientIP: ctx.clientIP,
  }));
}
```

#### Cloudflare Workers Usage

```javascript
import { createUnifiedContext } from "./context";

export default {
  async fetch(request, env, ctx) {
    const unifiedCtx = createUnifiedContext({
      platform: 'cloudflare',
      request,
      cloudflareEnv: env,
      cloudflareCf: request.cf,
      cloudflareCtx: ctx,
    });

    // Use unified API (same as Fastly!)
    const apiKey = unifiedCtx.env.get('API_KEY');
    const country = unifiedCtx.geo.country;
    const isMobile = unifiedCtx.device.type === 'mobile';

    unifiedCtx.waitUntil(logAnalytics(unifiedCtx));

    return new Response(JSON.stringify({
      country,
      isMobile,
      clientIP: unifiedCtx.clientIP,
    }));
  }
};
```

---

## Key Differences and Considerations

### Environment Variables

| Consideration | Recommendation |
|---------------|----------------|
| Empty vs undefined | Normalize to `undefined` for missing values |
| Type safety | Always return strings from unified API |
| Complex bindings | Keep Cloudflare-specific bindings accessible via platform-specific code |

### Geolocation

| Consideration | Recommendation |
|---------------|----------------|
| Type inconsistency | Normalize lat/long to numbers |
| Timezone format | Prefer IANA format (Cloudflare style) |
| Missing data | Use null consistently |
| Arbitrary IP lookup | Only Fastly supports this; Cloudflare is request-IP only |

### Device Detection

| Consideration | Recommendation |
|---------------|----------------|
| Accuracy | Fastly has better built-in detection |
| Bundle size | Cloudflare may require external library |
| Consistency | Provide fallback heuristics for both |

### Runtime Context

| Consideration | Recommendation |
|---------------|----------------|
| waitUntil | Both support this - unify signature |
| passThroughOnException | Cloudflare-only; simulate in Fastly if needed |
| Client IP | Different access patterns; abstract in unified context |

---

## Documentation Links

### Fastly Compute

- **fastly:env**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:env/env
- **fastly:geolocation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:geolocation/getGeolocationForIpAddress
- **fastly:device**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:device/Device/lookup
- **Environment Variables Reference**: https://developer.fastly.com/reference/compute/ecp-env/

### Cloudflare Workers

- **Bindings**: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- **Request.cf Properties**: https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties
- **Context API**: https://developers.cloudflare.com/workers/runtime-apis/context/
- **Fetch Handler**: https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/

---

## Conclusion

This unification strategy provides:

1. **Consistent API surface** for environment, geolocation, and device detection
2. **Platform-specific adapters** that handle implementation differences
3. **Type-safe interfaces** with TypeScript support
4. **Graceful degradation** for missing platform features
5. **Minimal overhead** with lazy evaluation where possible

The adapters bridge the fundamental architectural differences:
- Fastly's function-based approach vs. Cloudflare's object-based approach
- Fastly's explicit IP lookup vs. Cloudflare's automatic request enrichment
- Fastly's native device detection vs. Cloudflare's lack thereof

By abstracting these differences, developers can write portable edge computing code that runs on both platforms with minimal platform-specific logic.

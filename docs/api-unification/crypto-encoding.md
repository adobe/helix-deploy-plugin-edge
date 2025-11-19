# Cryptography and Encoding APIs: Fastly Compute vs Cloudflare Workers

This document analyzes the cryptography and encoding APIs available in both Fastly Compute and Cloudflare Workers, focusing on compatibility, differences, and unification strategies.

## Executive Summary

Both platforms implement Web Crypto API standards with high compatibility. Key differences exist in algorithm support depth, non-standard extensions, and some edge cases. The encoding APIs (TextEncoder/TextDecoder, atob/btoa) are nearly identical as they follow web standards.

---

## SubtleCrypto / Web Crypto API

### API Overview

| Platform | Cloudflare Workers | Fastly Compute |
|----------|-------------------|----------------|
| **Access** | `crypto.subtle` | `crypto.subtle` |
| **Standard** | Web Crypto API | Web Crypto API |
| **Compatibility** | High | Moderate |

### Purpose

Provides low-level cryptographic primitives for hashing, signing, encryption, and key management operations.

### Key Methods

| Method | Cloudflare | Fastly | Notes |
|--------|------------|--------|-------|
| `digest()` | Yes | Yes | Hash generation |
| `sign()` | Yes | Yes | Digital signatures |
| `verify()` | Yes | Yes | Signature verification |
| `encrypt()` | Yes | Limited | Data encryption |
| `decrypt()` | Yes | Limited | Data decryption |
| `generateKey()` | Yes | Unknown | Key generation |
| `importKey()` | Yes | Yes | External key import |
| `exportKey()` | Yes | Unknown | Key export |
| `deriveKey()` | Yes | Unknown | Key derivation |
| `deriveBits()` | Yes | Unknown | Bit derivation |
| `wrapKey()` | Yes | Unknown | Key wrapping |
| `unwrapKey()` | Yes | Unknown | Key unwrapping |

### Supported Algorithms

#### Digest/Hashing

| Algorithm | Cloudflare | Fastly | Notes |
|-----------|------------|--------|-------|
| SHA-1 | Yes (deprecated) | Yes (deprecated) | Legacy only |
| SHA-256 | Yes | Yes | Recommended |
| SHA-384 | Yes | Yes | Recommended |
| SHA-512 | Yes | Yes | Recommended |
| MD5 | Yes (legacy) | Yes (deprecated) | Non-standard, legacy support |

#### Signing/Verification

| Algorithm | Cloudflare | Fastly | Notes |
|-----------|------------|--------|-------|
| RSASSA-PKCS1-v1_5 | Yes | Yes | RSA signatures |
| RSA-PSS | Yes | Unknown | Probabilistic RSA |
| ECDSA | Yes | Yes | Elliptic curve signatures |
| Ed25519 | Yes | Unknown | Modern curve |
| HMAC | Yes | Yes | Symmetric authentication |
| NODE-ED25519 | Yes | No | Node.js specific |

#### Encryption/Decryption

| Algorithm | Cloudflare | Fastly | Notes |
|-----------|------------|--------|-------|
| RSA-OAEP | Yes | Unknown | Asymmetric encryption |
| AES-CTR | Yes | Unknown | Counter mode |
| AES-CBC | Yes | Unknown | Cipher block chaining |
| AES-GCM | Yes | Unknown | Galois/Counter mode |
| AES-KW | Yes | Unknown | Key wrapping |

#### Key Derivation

| Algorithm | Cloudflare | Fastly | Notes |
|-----------|------------|--------|-------|
| HKDF | Yes | Unknown | HMAC-based KDF |
| PBKDF2 | Yes | Unknown | Password-based KDF |
| ECDH | Yes | Yes (import) | Elliptic curve DH |
| X25519 | Yes | Unknown | Modern key exchange |

### Compatibility Level

**Medium-High** - Core operations (digest, sign, verify, importKey) are compatible. Cloudflare has broader algorithm support and more methods documented.

### Unification Notes

1. **Algorithm Support**: Cloudflare supports more algorithms (Ed25519, X25519, RSA-PSS). Code using these may need alternatives for Fastly.
2. **Key Import Formats**: Both support `raw` and `jwk` formats. Fastly documentation is explicit about PKCS#8 and SPKI being less supported.
3. **Non-standard Extensions**: Cloudflare adds `crypto.DigestStream` and `timingSafeEqual()` which are not available in Fastly.
4. **MD5 Support**: Both support MD5 for legacy compatibility but mark it as deprecated/non-standard.

---

## CryptoKey

### API Overview

| Platform | Both (Web Standard) |
|----------|---------------------|
| **Purpose** | Represents cryptographic key material |
| **Standard** | Web Crypto API |

### Instance Properties

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Key type: `"secret"`, `"private"`, or `"public"` |
| `extractable` | boolean | Whether key can be exported |
| `algorithm` | object | Algorithm configuration |
| `usages` | string[] | Permitted operations |

### Supported Key Usages

- `"encrypt"` - Data encryption
- `"decrypt"` - Data decryption
- `"sign"` - Signature generation
- `"verify"` - Signature verification
- `"deriveKey"` - Key derivation
- `"deriveBits"` - Bit derivation
- `"wrapKey"` - Key wrapping
- `"unwrapKey"` - Key unwrapping

### Compatibility Level

**High** - Standard Web Crypto CryptoKey interface, fully compatible.

### Unification Notes

No significant differences. All properties are read-only on both platforms.

---

## crypto.getRandomValues()

### API Overview

| Platform | Both (Web Standard) |
|----------|---------------------|
| **Purpose** | Generate cryptographically secure random values |
| **Return** | Filled TypedArray |

### Syntax

```javascript
crypto.getRandomValues(typedArray)
```

### Compatibility Level

**High** - Standard implementation on both platforms.

### Unification Notes

Both platforms implement this identically per web standard.

---

## crypto.randomUUID()

### API Overview

| Platform | Cloudflare Workers |
|----------|-------------------|
| **Purpose** | Generate RFC 4122 v4 UUID |
| **Return** | UUID string |

### Syntax

```javascript
crypto.randomUUID()
```

### Compatibility Level

**Low** - Not documented for Fastly Compute.

### Unification Notes

- **Cloudflare**: Natively supported
- **Fastly**: Not listed in globals documentation
- **Polyfill**: Can be implemented using `crypto.getRandomValues()`

```javascript
// Polyfill for Fastly
function randomUUID() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
```

---

## TextEncoder

### API Overview

| Platform | Both (Web Standard) |
|----------|---------------------|
| **Purpose** | Encode strings to UTF-8 bytes |
| **Standard** | Encoding API |

### Constructor

```javascript
new TextEncoder()
```

### Properties

| Property | Value | Description |
|----------|-------|-------------|
| `encoding` | `"utf-8"` | Always UTF-8 (read-only) |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `encode(string)` | `Uint8Array` | Encode string to bytes |
| `encodeInto(string, uint8Array)` | Object | Encode into existing array |

### Compatibility Level

**High** - Standard implementation, UTF-8 only.

### Unification Notes

Both platforms only support UTF-8 encoding. Other encodings are ignored/not supported.

**Documentation**:
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/TextEncoder
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/encoding/

---

## TextDecoder

### API Overview

| Platform | Both (Web Standard) |
|----------|---------------------|
| **Purpose** | Decode bytes to strings |
| **Standard** | Encoding API |

### Constructor

```javascript
new TextDecoder()
new TextDecoder(label)
new TextDecoder(label, options)
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `label` | string | `"utf-8"` | Encoding label |
| `options.fatal` | boolean | `false` | Throw on invalid input |
| `options.ignoreBOM` | boolean | `false` | Ignore byte order mark |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `encoding` | string | Encoding name (read-only) |
| `fatal` | boolean | Fatal error mode (read-only) |
| `ignoreBOM` | boolean | BOM handling (read-only) |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `decode(buffer)` | string | Decode bytes to string |
| `decode(buffer, options)` | string | Decode with options |

### Exceptions

- **RangeError**: Unknown or unsupported encoding label

### Compatibility Level

**High** - Standard implementation on both platforms.

### Unification Notes

1. **Encoding Support**: Both primarily support UTF-8; other encodings may have varying support.
2. **Error Handling**: Both throw RangeError for unsupported encodings.
3. **Options**: Both support `fatal` and `ignoreBOM` options.

**Documentation**:
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/TextDecoder
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/encoding/

---

## TextEncoderStream / TextDecoderStream

### API Overview

| Platform | Cloudflare Workers |
|----------|-------------------|
| **Purpose** | Streaming text encoding/decoding |
| **Standard** | Streams API + Encoding API |

### Compatibility Level

**Low** - Documented for Cloudflare, not for Fastly.

### Unification Notes

- **Cloudflare**: Explicitly documented as available
- **Fastly**: Not mentioned in documentation
- May need to implement streaming encoding manually for cross-platform code

---

## atob() - Base64 Decode

### API Overview

| Platform | Both (Web Standard) |
|----------|---------------------|
| **Purpose** | Decode Base64-encoded ASCII string |
| **Standard** | HTML Living Standard |

### Syntax

```javascript
atob(encodedData)
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `encodedData` | string | Base64-encoded string |

### Return Value

ASCII string containing decoded binary data.

### Exceptions

- **InvalidCharacterError**: Invalid Base64 characters in input

### Compatibility Level

**High** - Standard implementation on both platforms.

### Unification Notes

1. **Input Validation**: Both throw on invalid characters.
2. **Unicode Handling**: Neither handles multi-byte Unicode directly. Must use TextEncoder/TextDecoder for UTF-8.
3. **Binary Data**: Both treat each character as a single byte.

**Documentation**:
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/atob
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/web-standards/

---

## btoa() - Base64 Encode

### API Overview

| Platform | Both (Web Standard) |
|----------|---------------------|
| **Purpose** | Encode binary string to Base64 |
| **Standard** | HTML Living Standard |

### Syntax

```javascript
btoa(stringToEncode)
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `stringToEncode` | string | Binary string (single-byte chars) |

### Return Value

Base64-encoded ASCII string.

### Exceptions

- **InvalidCharacterError**: Multi-byte characters in input

### Compatibility Level

**High** - Standard implementation on both platforms.

### Unification Notes

1. **Single-Byte Only**: Both throw on characters requiring multiple bytes.
2. **UTF-8 Encoding Pattern**: Use `btoa(unescape(encodeURIComponent(str)))` for Unicode.
3. **Control Characters**: Both handle ASCII 0-31 correctly.

**Documentation**:
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/btoa
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/web-standards/

---

## CompressionStream

### API Overview

| Platform | Both (Web Standard) |
|----------|---------------------|
| **Purpose** | Compress data streams |
| **Standard** | Compression Streams API |

### Constructor

```javascript
new CompressionStream(format)
```

### Supported Formats

| Format | Cloudflare | Fastly | Description |
|--------|------------|--------|-------------|
| `"gzip"` | Yes | Yes | GNU zip compression |
| `"deflate"` | Yes | Yes | DEFLATE compression |
| `"deflate-raw"` | Yes | Yes | Raw DEFLATE (no headers) |

### Exceptions

- **TypeError**: Unsupported compression format

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `readable` | ReadableStream | Compressed output stream |
| `writable` | WritableStream | Input stream |

### Compatibility Level

**High** - Same formats supported on both platforms.

### Unification Notes

Both platforms support the same three compression formats. Implementation should be identical.

**Documentation**:
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/CompressionStream
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/web-standards/

---

## DecompressionStream

### API Overview

| Platform | Both (Web Standard) |
|----------|---------------------|
| **Purpose** | Decompress data streams |
| **Standard** | Compression Streams API |

### Constructor

```javascript
new DecompressionStream(format)
```

### Supported Formats

| Format | Cloudflare | Fastly | Description |
|--------|------------|--------|-------------|
| `"gzip"` | Yes | Yes | GNU zip decompression |
| `"deflate"` | Yes | Yes | DEFLATE decompression |
| `"deflate-raw"` | Yes | Yes | Raw DEFLATE (no headers) |

### Exceptions

- **TypeError**: Unsupported compression format

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `readable` | ReadableStream | Decompressed output stream |
| `writable` | WritableStream | Compressed input stream |

### Compatibility Level

**High** - Same formats supported on both platforms.

### Unification Notes

Identical to CompressionStream - both platforms support the same formats.

**Documentation**:
- Fastly: https://js-compute-reference-docs.edgecompute.app/docs/globals/DecompressionStream
- Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/web-standards/

---

## Platform-Specific Extensions

### Cloudflare-Only Features

| Feature | Description | Polyfill Possible |
|---------|-------------|-------------------|
| `crypto.DigestStream` | Streaming hash generation | Yes, manual implementation |
| `crypto.timingSafeEqual()` | Timing-attack resistant comparison | Yes, but security sensitive |
| `crypto.randomUUID()` | UUID v4 generation | Yes, using getRandomValues |
| `TextEncoderStream` | Streaming text encoding | Yes, using TransformStream |
| `TextDecoderStream` | Streaming text decoding | Yes, using TransformStream |

### Fastly-Only Features

No unique cryptographic features identified beyond standard Web Crypto API.

---

## Recommendations for Unification

### High-Priority (Essential for Cross-Platform)

1. **Use Standard Algorithms**: Stick to SHA-256/384/512, RSASSA-PKCS1-v1_5, ECDSA, HMAC for maximum compatibility.
2. **Test Key Import Formats**: Use `raw` or `jwk` formats which are supported on both.
3. **Avoid Platform Extensions**: Don't rely on `DigestStream`, `timingSafeEqual`, or streaming encoders without polyfills.

### Medium-Priority (Enhance Compatibility)

1. **Polyfill randomUUID**: Implement for Fastly if needed.
2. **Feature Detection**: Check for method availability before use.
3. **Error Handling**: Wrap crypto operations in try-catch for consistent behavior.

### Low-Priority (Nice to Have)

1. **Streaming Text Encoding**: Implement using TransformStream if needed on Fastly.
2. **Performance Optimization**: Cloudflare notes crypto operations are faster than pure JS; both platforms benefit from native crypto.

---

## Code Examples

### Cross-Platform Hash Function

```javascript
async function sha256(data) {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### Cross-Platform HMAC Signing

```javascript
async function hmacSign(key, data) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const message = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(signature);
}
```

### Cross-Platform Base64 with Unicode

```javascript
function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64Decode(str) {
  return decodeURIComponent(escape(atob(str)));
}
```

### Cross-Platform Compression

```javascript
async function compressData(data) {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(new TextEncoder().encode(data));
  writer.close();

  const reader = stream.readable.getReader();
  const chunks = [];
  let done, value;
  while ({ done, value } = await reader.read(), !done) {
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
```

---

## Summary Table

| API | Fastly | Cloudflare | Compatibility |
|-----|--------|------------|---------------|
| SubtleCrypto.digest() | Yes | Yes | High |
| SubtleCrypto.sign() | Yes | Yes | High |
| SubtleCrypto.verify() | Yes | Yes | High |
| SubtleCrypto.encrypt() | Limited | Yes | Medium |
| SubtleCrypto.decrypt() | Limited | Yes | Medium |
| SubtleCrypto.importKey() | Yes | Yes | High |
| CryptoKey | Yes | Yes | High |
| crypto.getRandomValues() | Yes | Yes | High |
| crypto.randomUUID() | No | Yes | Low |
| TextEncoder | Yes | Yes | High |
| TextDecoder | Yes | Yes | High |
| TextEncoderStream | No | Yes | Low |
| TextDecoderStream | No | Yes | Low |
| atob() | Yes | Yes | High |
| btoa() | Yes | Yes | High |
| CompressionStream | Yes | Yes | High |
| DecompressionStream | Yes | Yes | High |

---

## References

### Fastly Compute Documentation
- SubtleCrypto: https://js-compute-reference-docs.edgecompute.app/docs/globals/SubtleCrypto
- CryptoKey: https://js-compute-reference-docs.edgecompute.app/docs/globals/CryptoKey
- TextEncoder: https://js-compute-reference-docs.edgecompute.app/docs/globals/TextEncoder
- TextDecoder: https://js-compute-reference-docs.edgecompute.app/docs/globals/TextDecoder
- atob: https://js-compute-reference-docs.edgecompute.app/docs/globals/atob
- btoa: https://js-compute-reference-docs.edgecompute.app/docs/globals/btoa
- CompressionStream: https://js-compute-reference-docs.edgecompute.app/docs/globals/CompressionStream
- DecompressionStream: https://js-compute-reference-docs.edgecompute.app/docs/globals/DecompressionStream

### Cloudflare Workers Documentation
- Web Crypto API: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Encoding API: https://developers.cloudflare.com/workers/runtime-apis/encoding/
- Web Standards: https://developers.cloudflare.com/workers/runtime-apis/web-standards/

### Web Standards
- Web Crypto API: https://www.w3.org/TR/WebCryptoAPI/
- Encoding Standard: https://encoding.spec.whatwg.org/
- Compression Streams: https://wicg.github.io/compression/

---

## Implementation Recommendations

Based on the helix-universal adapter pattern (see [PR #426](https://github.com/adobe/helix-universal/pull/426)):

### Edge Wrapper Implementation

✅ **Edge Wrapper** - No custom implementation needed:
- **Web Crypto API** - Use platform native `crypto.subtle` (already Web Standard)
- **TextEncoder/TextDecoder** - Use platform native (already Web Standard)
- **atob/btoa** - Use platform native (already Web Standard)
- **Rationale**: These are standard Web APIs with high compatibility across both platforms

### Plugin Implementation

🔌 **Plugin** - Optional features:
- **JWT/Token Handling** - `@adobe/helix-edge-jwt` plugin for common auth patterns
- **Hashing Utilities** - `@adobe/helix-edge-hash` for request signing, ETags
- **Compression** - `@adobe/helix-edge-compress` for response compression

### Import/Polyfill Implementation

📦 **Import** - Application-level concerns:
- **jose** library for JWT operations
- **crypto-js** for additional algorithms
- Standard compression libraries for body compression

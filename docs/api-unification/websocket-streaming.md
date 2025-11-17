# WebSocket, Streaming, and Real-time APIs: Unification Analysis

This document analyzes the WebSocket and streaming APIs available in Fastly Compute and Cloudflare Workers to develop a unified abstraction strategy.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Fastly Compute APIs](#fastly-compute-apis)
3. [Cloudflare Workers APIs](#cloudflare-workers-apis)
4. [Cross-Platform Comparison](#cross-platform-comparison)
5. [Unification Strategy](#unification-strategy)
6. [Implementation Recommendations](#implementation-recommendations)

---

## Executive Summary

Both Fastly Compute and Cloudflare Workers provide WebSocket and streaming capabilities, but with fundamentally different architectural approaches:

- **Fastly Compute**: Uses a "handoff" model where WebSocket/Fanout connections are delegated to backend infrastructure
- **Cloudflare Workers**: Provides direct WebSocket handling with `WebSocketPair` and in-worker processing

The Streams APIs are more aligned, both following the WHATWG Streams Standard with minor implementation differences.

---

## Fastly Compute APIs

### 1. Fanout Module (`fastly:fanout`)

**Platform**: Fastly Compute
**Purpose**: Real-time communication via Fanout service delegation
**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/fastly:fanout/createFanoutHandoff

#### Key Interfaces

```javascript
import { createFanoutHandoff } from "fastly:fanout";
```

**createFanoutHandoff(request, backend)**

- **Parameters**:
  - `request` (Request): The incoming request to route through Fanout
  - `backend` (string): Backend identifier (1-254 characters)
- **Returns**: `Response` instance that instructs Fastly to pass the request through Fanout
- **Throws**: `TypeError` for invalid backend values

#### Usage Pattern

```javascript
import { createFanoutHandoff } from "fastly:fanout";

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const url = new URL(event.request.url);

  if (url.pathname === "/stream") {
    return createFanoutHandoff(event.request, "fanout");
  }

  return new Response("Not Found", { status: 404 });
}
```

#### Key Characteristics

- **Handoff Model**: The worker doesn't process WebSocket frames directly; instead, it delegates to Fastly's Fanout infrastructure
- **Backend Delegation**: Requires a configured backend service
- **Infrastructure-Level**: Real-time processing happens at the Fastly infrastructure layer, not in the worker itself

---

### 2. WebSocket Module (`fastly:websocket`)

**Platform**: Fastly Compute
**Purpose**: WebSocket connection handoff
**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs (listed in module index)

#### Key Interfaces

```javascript
import { createWebsocketHandoff } from "fastly:websocket";
```

**createWebsocketHandoff(request, backend)**

Similar to `createFanoutHandoff`, this function creates a Response that instructs Fastly to handle the WebSocket connection at the infrastructure level.

#### Key Characteristics

- **Proxy Pattern**: Workers act as routing/decision points, not connection endpoints
- **Infrastructure Offloading**: Connection management handled by Fastly's edge infrastructure
- **Limited In-Worker Processing**: Cannot directly read/write WebSocket messages within the worker

---

### 3. Streams API (Fastly)

**Platform**: Fastly Compute
**Purpose**: Stream processing for request/response bodies
**Documentation**: https://js-compute-reference-docs.edgecompute.app/docs/globals/

#### ReadableStream

```javascript
new ReadableStream(underlyingSource, queuingStrategy)
```

**Underlying Source Methods**:
- `start(controller)`: Initialize stream (sync or async)
- `pull(controller)`: Fetch data on demand
- `cancel(reason)`: Handle cancellation

**Configuration**:
- `type`: Set to `"bytes"` for byte streams with `ReadableByteStreamController`
- `autoAllocateChunkSize`: Enable zero-copy transfers for byte streams

**Queuing Strategy**:
- `highWaterMark`: Maximum queued chunks before backpressure
- `size(chunk)`: Calculate chunk size

#### WritableStream

```javascript
new WritableStream(underlyingSink, queuingStrategy)
```

**Underlying Sink Methods**:
- `start(controller)`: Initialize sink
- `write(chunk, controller)`: Process each chunk
- `close(controller)`: Finalize writing
- `abort(reason)`: Handle abrupt closure

#### TransformStream

```javascript
new TransformStream(transformer, writableStrategy, readableStrategy)
```

**Transformer Methods**:
- `start(controller)`: Initialize transformer
- `transform(chunk, controller)`: Process each chunk
- `flush(controller)`: Final processing before close

**Default Behavior**: Identity transform if no transformer provided.

---

## Cloudflare Workers APIs

### 1. WebSocketPair

**Platform**: Cloudflare Workers
**Purpose**: Create bidirectional WebSocket connections within workers
**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/websockets/

#### Key Interfaces

```javascript
const webSocketPair = new WebSocketPair();
const [client, server] = Object.values(webSocketPair);
```

**WebSocket Methods**:
- `accept()`: Activate the WebSocket connection
- `send(message)`: Send string, ArrayBuffer, or ArrayBufferView (max 1 MiB)
- `addEventListener(type, callback)`: Register event handlers
- `close(code?, reason?)`: Terminate connection with optional status

**Supported Events**:
- `message`: Received data from paired WebSocket
- `close`: Connection terminated
- `error`: WebSocket-related issues

#### Server-Side Pattern

```javascript
async function handleWebSocket(request) {
  const upgradeHeader = request.headers.get("Upgrade");
  if (upgradeHeader !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();

  server.addEventListener("message", (event) => {
    console.log("Received:", event.data);
    server.send(`Echo: ${event.data}`);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
```

#### Client-Side Pattern (Worker-to-Server)

```javascript
const response = await fetch("wss://example.com/ws", {
  headers: { Upgrade: "websocket" }
});

const ws = response.webSocket;
ws.accept();
ws.send("Hello");

ws.addEventListener("message", (event) => {
  console.log(event.data);
});
```

#### Key Characteristics

- **In-Worker Processing**: Full message handling within the worker
- **Direct Control**: Read/write WebSocket frames directly
- **Event-Driven**: Standard WebSocket event model
- **Message Size Limit**: 1 MiB per message (1048576 bytes)

---

### 2. Hibernatable WebSockets (Durable Objects)

**Platform**: Cloudflare Workers (Durable Objects)
**Purpose**: Cost-efficient WebSocket handling with hibernation
**Documentation**: https://developers.cloudflare.com/durable-objects/api/websockets/

#### Key Interfaces

**DurableObjectState Methods**:
- `acceptWebSocket(ws)`: Accept connection with hibernation support
- `getWebSockets()`: Retrieve connected WebSockets after wake-up

**WebSocket Attachment Methods**:
- `serializeAttachment(value)`: Persist data with WebSocket (max 2048 bytes)
- `deserializeAttachment()`: Retrieve persisted data

**Event Handlers** (class methods):
- `webSocketMessage(ws, message)`: Handle incoming messages
- `webSocketClose(ws, code, reason, wasClean)`: Handle disconnection

#### Key Characteristics

- **Cost Optimization**: Durable Objects hibernate during idle periods
- **Persistent State**: Data survives hibernation cycles
- **Multi-Connection Support**: Single point of coordination for multiple WebSockets
- **Server-Side Only**: Outgoing WebSocket connections cannot hibernate

---

### 3. TCP Sockets

**Platform**: Cloudflare Workers
**Purpose**: Direct TCP connections
**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/

#### Key Interfaces

```javascript
import { connect } from "cloudflare:sockets";

const socket = connect("hostname:port", options);
// or
const socket = connect({ hostname: "example.com", port: 443 }, options);
```

**SocketOptions**:
- `secureTransport`: `"off"` | `"on"` | `"starttls"`
- `allowHalfOpen`: Control writable side behavior on EOF

**Socket Properties**:
- `opened`: Promise resolving when connected
- `closed`: Promise resolving when closed
- `readable`: ReadableStream for incoming data
- `writable`: WritableStream for outgoing data

**Socket Methods**:
- `close()`: Force close both streams
- `startTls()`: Upgrade to TLS (requires `secureTransport: "starttls"`)

#### Usage Pattern

```javascript
import { connect } from "cloudflare:sockets";

const socket = connect("example.com:443", { secureTransport: "on" });
await socket.opened;

const writer = socket.writable.getWriter();
const encoder = new TextEncoder();
await writer.write(encoder.encode("GET / HTTP/1.1\r\n\r\n"));

const reader = socket.readable.getReader();
const { value } = await reader.read();
console.log(new TextDecoder().decode(value));
```

#### Key Characteristics

- **Direct TCP Access**: Not limited to HTTP/WebSocket protocols
- **Streams Integration**: Uses standard Web Streams API
- **TLS Support**: Built-in TLS and STARTTLS capabilities
- **Constraints**: Cannot connect to Cloudflare IPs or port 25

---

### 4. EventSource (Server-Sent Events)

**Platform**: Cloudflare Workers
**Purpose**: Server-to-client push events
**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/eventsource/

#### Key Interfaces

```javascript
const es = new EventSource(url, { fetcher: customFetcher });
```

**Properties**:
- `url`: Connection endpoint (read-only)
- `readyState`: Current connection state (read-only)
- `withCredentials`: CORS credentials status (read-only)

**Events**:
- `open`: Connection established
- `message`: Data received
- `error`: Connection/transmission failure

**Methods**:
- `close()`: Terminate connection
- `EventSource.from(readableStream)`: Cloudflare-specific method for existing streams

#### Key Characteristics

- **Unidirectional**: Server-to-client push only
- **HTTP-Based**: Uses standard HTTP with text/event-stream
- **Auto-Reconnect**: Built-in reconnection handling
- **Custom Fetcher**: Support for Workers service bindings

---

### 5. Streams API (Cloudflare)

**Platform**: Cloudflare Workers
**Purpose**: Streaming data processing
**Documentation**: https://developers.cloudflare.com/workers/runtime-apis/streams/

#### ReadableStream

**Properties**:
- `locked`: Boolean indicating if stream is locked to a reader

**Methods**:
- `pipeTo(destination, options)`: Pipe to WritableStream
- `getReader(options)`: Get reader (default or BYOB mode)

**PipeToOptions**:
- `preventClose`: Don't close destination when source closes
- `preventAbort`: Don't abort destination on source error

#### WritableStream

**Properties**:
- `locked`: Boolean indicating if stream is locked to a writer

**Methods**:
- `abort(reason?)`: Terminate with optional reason
- `getWriter()`: Get WritableStreamDefaultWriter

**Note**: Cannot be directly instantiated; obtained from TransformStream.

#### TransformStream

```javascript
const { readable, writable } = new TransformStream();
```

**Specialized Classes**:

1. **IdentityTransformStream**: Pass-through with BYOB support
2. **FixedLengthStream**: Enforces exact byte count
   ```javascript
   const { readable, writable } = new FixedLengthStream(1000);
   ```

#### Streaming Patterns

```javascript
// Transform pattern (non-blocking)
const { readable, writable } = new TransformStream();
request.body.pipeTo(writable); // Don't await
return new Response(readable);

// Custom transformation
const transform = new TransformStream({
  transform(chunk, controller) {
    controller.enqueue(chunk.toUpperCase());
  }
});
```

---

## Cross-Platform Comparison

### WebSocket Support

| Feature | Fastly Compute | Cloudflare Workers |
|---------|---------------|-------------------|
| **Architecture** | Handoff to infrastructure | In-worker processing |
| **Message Access** | No direct access | Full access to frames |
| **Event Handling** | Backend-level | Worker-level |
| **State Management** | External backend | In-worker or Durable Objects |
| **Hibernation** | N/A | Durable Objects support |
| **Max Message Size** | Backend-dependent | 1 MiB |

### Streams API

| Feature | Fastly Compute | Cloudflare Workers |
|---------|---------------|-------------------|
| **ReadableStream** | Full constructor support | Limited to TransformStream output |
| **WritableStream** | Full constructor support | Limited to TransformStream output |
| **TransformStream** | Standard WHATWG | Extended (IdentityTransformStream, FixedLengthStream) |
| **BYOB Readers** | Supported | Supported |
| **Backpressure** | `highWaterMark` | `highWaterMark` |

### Real-time Patterns

| Pattern | Fastly Compute | Cloudflare Workers |
|---------|---------------|-------------------|
| **WebSocket Server** | `createWebsocketHandoff()` | `WebSocketPair` |
| **Pub/Sub** | `createFanoutHandoff()` | Durable Objects coordination |
| **Server-Sent Events** | Manual stream construction | `EventSource` API |
| **TCP Connections** | Not available | `connect()` from `cloudflare:sockets` |
| **HTTP Streaming** | Standard fetch + streams | Standard fetch + streams |

---

## Unification Strategy

### 1. WebSocket Abstraction Layer

Create a unified interface that handles the architectural differences:

```typescript
interface UnifiedWebSocket {
  // Connection management
  accept(): void;
  close(code?: number, reason?: string): void;

  // Message handling
  send(message: string | ArrayBuffer | ArrayBufferView): void;
  onMessage(handler: (data: MessageData) => void): void;
  onClose(handler: (event: CloseEvent) => void): void;
  onError(handler: (error: Error) => void): void;
}

interface WebSocketAdapter {
  // Server-side WebSocket creation
  createServerWebSocket(request: Request): Promise<{
    response: Response;
    socket?: UnifiedWebSocket; // Optional for handoff platforms
  }>;

  // Client-side WebSocket connection
  connectToWebSocket(url: string): Promise<UnifiedWebSocket>;

  // Platform detection
  supportsInWorkerProcessing(): boolean;
  supportsHibernation(): boolean;
}
```

#### Platform Implementations

**Fastly Implementation**:
```typescript
class FastlyWebSocketAdapter implements WebSocketAdapter {
  async createServerWebSocket(request: Request) {
    // Handoff model - no in-worker socket access
    const response = createWebsocketHandoff(request, this.backend);
    return { response };
  }

  supportsInWorkerProcessing() {
    return false; // Handoff model
  }
}
```

**Cloudflare Implementation**:
```typescript
class CloudflareWebSocketAdapter implements WebSocketAdapter {
  async createServerWebSocket(request: Request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const socket = new CloudflareUnifiedWebSocket(server);
    const response = new Response(null, {
      status: 101,
      webSocket: client
    });

    return { response, socket };
  }

  supportsInWorkerProcessing() {
    return true;
  }
}
```

### 2. Streams Unification

The Streams APIs are relatively aligned. Main abstractions needed:

```typescript
interface StreamFactory {
  // Readable stream creation
  createReadable<T>(
    underlyingSource?: UnderlyingSource<T>,
    strategy?: QueuingStrategy<T>
  ): ReadableStream<T>;

  // Writable stream creation (platform-specific)
  createWritable<T>(
    underlyingSink?: UnderlyingSink<T>,
    strategy?: QueuingStrategy<T>
  ): WritableStream<T>;

  // Transform stream creation
  createTransform<I, O>(
    transformer?: Transformer<I, O>,
    writableStrategy?: QueuingStrategy<I>,
    readableStrategy?: QueuingStrategy<O>
  ): TransformStream<I, O>;

  // Fixed-length stream (Cloudflare-specific)
  createFixedLength?(byteLength: number): TransformStream<Uint8Array, Uint8Array>;
}
```

### 3. Real-time Communication Patterns

#### Pub/Sub Pattern

```typescript
interface PubSubAdapter {
  // Publish message to channel
  publish(channel: string, message: unknown): Promise<void>;

  // Subscribe to channel
  subscribe(channel: string, handler: (message: unknown) => void): Subscription;

  // Platform capabilities
  capabilities(): {
    fanout: boolean;
    durableObjects: boolean;
    eventSource: boolean;
  };
}
```

**Fastly (Fanout)**:
```typescript
class FastlyPubSub implements PubSubAdapter {
  async publish(channel: string, message: unknown) {
    // Route through Fanout backend
    return createFanoutHandoff(/* ... */);
  }
}
```

**Cloudflare (Durable Objects)**:
```typescript
class CloudflarePubSub implements PubSubAdapter {
  async publish(channel: string, message: unknown) {
    const channelDO = this.getChannelDO(channel);
    await channelDO.broadcast(message);
  }
}
```

### 4. Server-Sent Events (SSE)

```typescript
interface SSEAdapter {
  // Create SSE response
  createEventStream(
    generator: AsyncGenerator<SSEEvent>
  ): Response;

  // Consume SSE stream (Cloudflare has native support)
  consumeEventStream(
    url: string,
    options?: SSEOptions
  ): EventSource | AsyncGenerator<SSEEvent>;
}

interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}
```

### 5. TCP Socket Abstraction

```typescript
interface SocketAdapter {
  // Check if platform supports TCP sockets
  supportsTCPSockets(): boolean;

  // Connect to TCP endpoint (Cloudflare only)
  connect?(
    address: string | SocketAddress,
    options?: SocketOptions
  ): Promise<TCPSocket>;
}

interface TCPSocket {
  opened: Promise<void>;
  closed: Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): void;
  startTls?(): Promise<TCPSocket>;
}
```

---

## Implementation Recommendations

### 1. Feature Detection

```typescript
const platform = detectPlatform();

const features = {
  // WebSocket capabilities
  webSocketHandoff: platform === 'fastly',
  webSocketInWorker: platform === 'cloudflare',
  webSocketHibernation: platform === 'cloudflare' && hasDurableObjects(),

  // Streaming capabilities
  fullStreamConstructors: platform === 'fastly',
  fixedLengthStreams: platform === 'cloudflare',

  // Real-time capabilities
  fanout: platform === 'fastly',
  eventSource: platform === 'cloudflare',
  tcpSockets: platform === 'cloudflare',
};
```

### 2. Adapter Selection

```typescript
function createWebSocketHandler(config: Config) {
  if (features.webSocketInWorker && config.needsMessageAccess) {
    return new CloudflareWebSocketAdapter();
  }

  if (features.webSocketHandoff && !config.needsMessageAccess) {
    return new FastlyWebSocketAdapter(config.backend);
  }

  throw new Error('Unsupported WebSocket configuration for platform');
}
```

### 3. Graceful Degradation

When an API is not available on a platform:

1. **WebSocket Message Access** (Fastly): Route to backend, provide hooks for backend integration
2. **TCP Sockets** (Fastly): Use HTTP proxy or backend service
3. **Hibernation** (Fastly): Use external state storage
4. **Fixed-Length Streams** (Fastly): Manual Content-Length management

### 4. Common Patterns to Abstract

1. **Request/Response Streaming**: Both platforms support this well
2. **WebSocket Upgrade**: Different patterns but achievable
3. **Real-time Broadcasting**: Fanout vs Durable Objects (significant architectural difference)
4. **Server-Sent Events**: Manual on Fastly, native on Cloudflare

### 5. Testing Strategy

```typescript
// Abstract test helpers
interface StreamingTestSuite {
  testReadableStreamCreation(): void;
  testTransformPipeline(): void;
  testWebSocketHandshake(): void;
  testMessageRoundtrip(): void;
  testStreamBackpressure(): void;
}

// Platform-specific implementations
class FastlyStreamingTests implements StreamingTestSuite { /* ... */ }
class CloudflareStreamingTests implements StreamingTestSuite { /* ... */ }
```

---

## References

### Fastly Compute Documentation
- Main Reference: https://js-compute-reference-docs.edgecompute.app/docs/
- Fanout: https://js-compute-reference-docs.edgecompute.app/docs/fastly:fanout/createFanoutHandoff
- ReadableStream: https://js-compute-reference-docs.edgecompute.app/docs/globals/ReadableStream
- WritableStream: https://js-compute-reference-docs.edgecompute.app/docs/globals/WritableStream
- TransformStream: https://js-compute-reference-docs.edgecompute.app/docs/globals/TransformStream

### Cloudflare Workers Documentation
- WebSockets: https://developers.cloudflare.com/workers/runtime-apis/websockets/
- Streams: https://developers.cloudflare.com/workers/runtime-apis/streams/
- TCP Sockets: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- EventSource: https://developers.cloudflare.com/workers/runtime-apis/eventsource/
- Durable Objects WebSockets: https://developers.cloudflare.com/durable-objects/api/websockets/
- WebSocket Examples: https://developers.cloudflare.com/workers/examples/websockets/

---

## Conclusion

The fundamental architectural difference between Fastly Compute (handoff model) and Cloudflare Workers (in-worker processing) presents the biggest challenge for unification. The recommended approach is:

1. **Abstract at the capability level**, not the implementation level
2. **Provide clear feature detection** for runtime capability checking
3. **Allow platform-specific optimizations** while maintaining a common interface
4. **Document limitations clearly** when features aren't available cross-platform
5. **Use adapter patterns** to hide platform-specific implementations

For streaming APIs, the differences are smaller and can be unified more easily. The main concern is ensuring that platform-specific extensions (like Cloudflare's `FixedLengthStream`) have reasonable fallbacks on other platforms.

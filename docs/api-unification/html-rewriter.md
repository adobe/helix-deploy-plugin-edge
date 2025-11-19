# HTML Rewriter API Unification Analysis

This document analyzes the HTML Rewriter APIs for Fastly Compute and Cloudflare Workers platforms, providing a comprehensive strategy for creating cross-platform HTML transformation capabilities.

## Table of Contents

1. [Overview](#overview)
2. [Cloudflare HTMLRewriter](#cloudflare-htmlrewriter)
3. [Fastly HTML Transformation](#fastly-html-transformation)
4. [Platform Differences](#platform-differences)
5. [Unification Strategy](#unification-strategy)
6. [Common Use Cases](#common-use-cases)
7. [Performance Considerations](#performance-considerations)

---

## Overview

### Purpose
Transform HTML responses at the edge without buffering the entire response, enabling:
- Content injection (analytics, A/B testing scripts)
- Link rewriting (CDN URLs, protocol upgrades)
- Content modification (personalization, localization)
- Security enhancements (CSP nonce injection, sanitization)
- SEO optimizations (meta tag updates, structured data)

### Key Concept
Both platforms provide streaming HTML parsing and transformation, allowing modifications to be applied as HTML streams through the edge without waiting for the complete response.

---

## Cloudflare HTMLRewriter

### Platform: Cloudflare Workers

### Purpose
Low-latency streaming HTML parser with an easy-to-use CSS selector-based API for DOM manipulation.

### Documentation
https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/

### Key Classes/Functions

#### HTMLRewriter Class
```javascript
const rewriter = new HTMLRewriter()
  .on(selector, elementHandler)
  .onDocument(documentHandler)
  .transform(response);
```

#### Element Handlers
```javascript
class ElementHandler {
  element(element) {
    // Called for matched elements
  }

  comments(comment) {
    // Called for comments within matched elements
  }

  text(text) {
    // Called for text chunks within matched elements
  }
}
```

#### Element API
```javascript
element.tagName                    // Get/set tag name
element.hasAttribute(name)         // Check attribute existence
element.getAttribute(name)         // Get attribute value
element.setAttribute(name, value)  // Set attribute
element.removeAttribute(name)      // Remove attribute
element.attributes                 // Iterator of [name, value] pairs

element.before(content, options)   // Insert before element
element.after(content, options)    // Insert after element
element.prepend(content, options)  // Insert at start of element
element.append(content, options)   // Insert at end of element
element.replace(content, options)  // Replace entire element
element.setInnerContent(content, options)  // Replace inner HTML
element.remove()                   // Remove element
element.removeAndKeepContent()     // Remove tags but keep content

element.onEndTag(handler)          // Handle end tag
```

#### Content Options
```javascript
// Options for before(), after(), prepend(), append(), replace(), setInnerContent()
{
  html: true  // Treat content as raw HTML (default: false, escaped as text)
}
```

#### Text Chunk API
```javascript
text.text          // The text content (may be partial)
text.lastInTextNode  // Boolean: is this the last chunk?
text.removed       // Boolean: was this removed?

text.before(content, options)
text.after(content, options)
text.replace(content, options)
text.remove()
```

#### Comment API
```javascript
comment.text       // Comment content (without <!-- -->)
comment.removed    // Boolean: was this removed?

comment.before(content, options)
comment.after(content, options)
comment.replace(content, options)
comment.remove()
```

#### Document Handlers
```javascript
class DocumentHandler {
  doctype(doctype) {
    // doctype.name, doctype.publicId, doctype.systemId
  }

  comments(comment) {
    // Document-level comments
  }

  text(text) {
    // Document-level text
  }

  end(end) {
    // End of document
    end.append(content, options)
  }
}
```

#### Selectors (Subset of CSS)
```javascript
// Supported selectors
'*'                    // All elements
'div'                  // Tag name
'.class'               // Class selector
'#id'                  // ID selector
'[attr]'               // Attribute presence
'[attr="value"]'       // Exact attribute match
'[attr^="prefix"]'     // Attribute starts with
'[attr$="suffix"]'     // Attribute ends with
'[attr*="contains"]'   // Attribute contains
'div.class'            // Combined selectors
'div > span'           // Direct child (limited support)
'div span'             // Descendant (limited support)
```

### Code Example

```javascript
export default {
  async fetch(request, env) {
    const response = await fetch(request);

    return new HTMLRewriter()
      .on('head', {
        element(element) {
          // Inject analytics script
          element.append(
            '<script src="https://analytics.example.com/tracker.js"></script>',
            { html: true }
          );
        }
      })
      .on('a[href^="http://"]', {
        element(element) {
          // Upgrade HTTP links to HTTPS
          const href = element.getAttribute('href');
          element.setAttribute('href', href.replace('http://', 'https://'));
        }
      })
      .on('img', {
        element(element) {
          // Add lazy loading
          if (!element.hasAttribute('loading')) {
            element.setAttribute('loading', 'lazy');
          }
        }
      })
      .on('script', {
        element(element) {
          // Add CSP nonce
          element.setAttribute('nonce', 'random-nonce-value');
        }
      })
      .onDocument({
        end(end) {
          // Append content at document end
          end.append('<!-- Processed by Edge Worker -->', { html: true });
        }
      })
      .transform(response);
  }
};
```

---

## Fastly HTML Transformation

### Platform: Fastly Compute

### Purpose
Stream-based HTML transformation using a SAX-like parser approach.

### Documentation
https://js-compute-reference-docs.edgecompute.app/docs/fastly:experimental/html-transform/

**Note**: As of current documentation, Fastly's HTML transformation is in the `fastly:experimental` module.

### Key Classes/Functions

#### HtmlTransform Class (Experimental)
```javascript
import { HtmlTransform } from 'fastly:experimental';

const transform = new HtmlTransform((elem) => {
  // Element handler callback
});
```

#### Alternative: Custom Streaming Parser
Since Fastly's built-in HTML transformation is experimental, applications may need to use streaming body transformation:

```javascript
import { TransformStream } from 'fastly:streams';

class HTMLStreamTransformer {
  transform(chunk, controller) {
    // Process HTML chunk
    // Apply transformations
    controller.enqueue(transformedChunk);
  }

  flush(controller) {
    // Final processing
  }
}
```

#### Using Third-Party Parser (htmlparser2)
```javascript
import { Parser } from 'htmlparser2';
import { TransformStream } from 'fastly:streams';

function createHTMLTransform(handlers) {
  let output = '';

  const parser = new Parser({
    onopentag(name, attribs) {
      // Apply transformations
      const modified = handlers.onElement?.(name, attribs) || { name, attribs };
      output += buildOpenTag(modified.name, modified.attribs);
    },
    ontext(text) {
      output += handlers.onText?.(text) || text;
    },
    onclosetag(name) {
      output += `</${name}>`;
    },
    oncomment(text) {
      output += `<!--${text}-->`;
    }
  }, { decodeEntities: false });

  return new TransformStream({
    transform(chunk, controller) {
      parser.write(chunk);
      controller.enqueue(output);
      output = '';
    },
    flush(controller) {
      parser.end();
      if (output) controller.enqueue(output);
    }
  });
}
```

### Code Example

```javascript
// Using experimental HtmlTransform (if available)
import { HtmlTransform } from 'fastly:experimental';

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const backendResponse = await fetch(request, { backend: 'origin' });

  const transform = new HtmlTransform((elem) => {
    // Transform elements
    if (elem.tagName === 'a') {
      const href = elem.getAttribute('href');
      if (href && href.startsWith('http://')) {
        elem.setAttribute('href', href.replace('http://', 'https://'));
      }
    }

    if (elem.tagName === 'img' && !elem.hasAttribute('loading')) {
      elem.setAttribute('loading', 'lazy');
    }
  });

  const transformedBody = backendResponse.body.pipeThrough(transform);

  return new Response(transformedBody, {
    status: backendResponse.status,
    headers: backendResponse.headers
  });
}

// Alternative: Manual streaming transformation
async function handleRequestWithCustomParser(request) {
  const backendResponse = await fetch(request, { backend: 'origin' });

  const { readable, writable } = new TransformStream({
    transform(chunk, controller) {
      // Simple regex-based transformation (not recommended for complex HTML)
      let text = new TextDecoder().decode(chunk);

      // Example: Add lazy loading to images
      text = text.replace(/<img(?![^>]*loading=)/gi, '<img loading="lazy"');

      // Example: Upgrade HTTP links
      text = text.replace(/href="http:\/\//gi, 'href="https://');

      controller.enqueue(new TextEncoder().encode(text));
    }
  });

  backendResponse.body.pipeTo(writable);

  return new Response(readable, {
    status: backendResponse.status,
    headers: backendResponse.headers
  });
}
```

---

## Platform Differences

| Feature | Cloudflare HTMLRewriter | Fastly HTML Transform |
|---------|------------------------|----------------------|
| **API Maturity** | Production-ready, stable API | Experimental (`fastly:experimental`) |
| **Selector Support** | Rich CSS selector syntax | Limited/manual element matching |
| **Chaining** | Fluent `.on()` chaining | Single callback or custom streams |
| **Element Manipulation** | Rich API (before, after, prepend, append, replace) | Basic attribute/content modification |
| **Text Handling** | Streaming text chunks with position info | Manual text node handling |
| **Comment Handling** | Built-in comment handlers | Manual comment processing |
| **Document Handlers** | `onDocument()` for doctype, end events | Manual implementation required |
| **Content Escaping** | `{ html: true }` option | Manual escaping management |
| **Performance** | Optimized C++ parser (lol-html) | JavaScript-based or experimental native |
| **Memory Model** | Streaming with minimal buffering | Depends on implementation |
| **End Tag Handling** | `element.onEndTag()` | Not directly supported |
| **Attribute Iteration** | `element.attributes` iterator | Manual attribute access |

### API Comparison

| Operation | Cloudflare | Fastly |
|-----------|------------|--------|
| Select by tag | `.on('div', handler)` | Manual check in callback |
| Select by class | `.on('.classname', handler)` | Manual attribute check |
| Select by ID | `.on('#id', handler)` | Manual attribute check |
| Select by attribute | `.on('[data-x]', handler)` | Manual attribute check |
| Get attribute | `element.getAttribute('href')` | `elem.getAttribute('href')` |
| Set attribute | `element.setAttribute('href', 'val')` | `elem.setAttribute('href', 'val')` |
| Remove element | `element.remove()` | Not directly supported |
| Insert before | `element.before('<div>', { html: true })` | Manual output manipulation |
| Insert after | `element.after('<div>', { html: true })` | Manual output manipulation |
| Replace content | `element.setInnerContent('new')` | Manual content replacement |
| Transform stream | `rewriter.transform(response)` | `response.body.pipeThrough(transform)` |

---

## Unification Strategy

### Unified HTMLRewriter Interface

```javascript
// unified-html-rewriter.js

class UnifiedHTMLRewriter {
  constructor(platform) {
    this.platform = platform;
    this.elementHandlers = [];
    this.documentHandlers = null;
  }

  on(selector, handler) {
    this.elementHandlers.push({ selector, handler });
    return this;
  }

  onDocument(handler) {
    this.documentHandlers = handler;
    return this;
  }

  transform(response) {
    if (this.platform === 'cloudflare') {
      return this._transformCloudflare(response);
    } else if (this.platform === 'fastly') {
      return this._transformFastly(response);
    }
    throw new Error(`Unsupported platform: ${this.platform}`);
  }

  _transformCloudflare(response) {
    const rewriter = new HTMLRewriter();

    for (const { selector, handler } of this.elementHandlers) {
      rewriter.on(selector, handler);
    }

    if (this.documentHandlers) {
      rewriter.onDocument(this.documentHandlers);
    }

    return rewriter.transform(response);
  }

  async _transformFastly(response) {
    // Use custom streaming parser for Fastly
    const transformer = this._createFastlyTransformer();
    const transformedBody = response.body.pipeThrough(transformer);

    return new Response(transformedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  _createFastlyTransformer() {
    const handlers = this.elementHandlers;
    const documentHandlers = this.documentHandlers;

    return new TransformStream({
      start() {
        this.buffer = '';
        this.inElement = false;
        this.currentTag = '';
        this.hasDoctype = false;
      },

      transform(chunk, controller) {
        const text = typeof chunk === 'string'
          ? chunk
          : new TextDecoder().decode(chunk);

        const transformed = this._processChunk(text, handlers, documentHandlers);
        controller.enqueue(new TextEncoder().encode(transformed));
      },

      flush(controller) {
        if (documentHandlers?.end) {
          const endContent = { _appended: '' };
          documentHandlers.end({
            append: (content, options = {}) => {
              endContent._appended += options.html ? content : escapeHtml(content);
            }
          });
          if (endContent._appended) {
            controller.enqueue(new TextEncoder().encode(endContent._appended));
          }
        }
      },

      _processChunk(text, handlers, documentHandlers) {
        // Simple tag-based transformation
        // Note: This is a simplified implementation; production use may require
        // a full HTML parser like htmlparser2

        let result = text;

        for (const { selector, handler } of handlers) {
          result = this._applyHandler(result, selector, handler);
        }

        return result;
      },

      _applyHandler(html, selector, handler) {
        // Parse selector
        const selectorInfo = parseSelector(selector);

        // Apply transformations based on selector type
        const tagRegex = new RegExp(
          `<(${selectorInfo.tagName || '[a-zA-Z][a-zA-Z0-9]*'})([^>]*)>`,
          'gi'
        );

        return html.replace(tagRegex, (match, tagName, attributes) => {
          if (!matchesSelector(tagName, attributes, selectorInfo)) {
            return match;
          }

          // Create element proxy for handler
          const elementProxy = new FastlyElementProxy(tagName, attributes);

          if (handler.element) {
            handler.element(elementProxy);
          }

          return elementProxy.render();
        });
      }
    });
  }
}

// Fastly Element Proxy
class FastlyElementProxy {
  constructor(tagName, attributesString) {
    this.tagName = tagName;
    this._attributes = parseAttributes(attributesString);
    this._beforeContent = '';
    this._afterContent = '';
    this._prependContent = '';
    this._appendContent = '';
    this._removed = false;
    this._replaced = null;
    this._innerContent = null;
  }

  get attributes() {
    return Object.entries(this._attributes)[Symbol.iterator]();
  }

  hasAttribute(name) {
    return name in this._attributes;
  }

  getAttribute(name) {
    return this._attributes[name] || null;
  }

  setAttribute(name, value) {
    this._attributes[name] = value;
  }

  removeAttribute(name) {
    delete this._attributes[name];
  }

  before(content, options = {}) {
    this._beforeContent += options.html ? content : escapeHtml(content);
  }

  after(content, options = {}) {
    this._afterContent += options.html ? content : escapeHtml(content);
  }

  prepend(content, options = {}) {
    this._prependContent += options.html ? content : escapeHtml(content);
  }

  append(content, options = {}) {
    this._appendContent += options.html ? content : escapeHtml(content);
  }

  replace(content, options = {}) {
    this._replaced = options.html ? content : escapeHtml(content);
  }

  setInnerContent(content, options = {}) {
    this._innerContent = options.html ? content : escapeHtml(content);
  }

  remove() {
    this._removed = true;
  }

  removeAndKeepContent() {
    this._removeTags = true;
  }

  onEndTag(handler) {
    this._endTagHandler = handler;
  }

  render() {
    if (this._removed) {
      return '';
    }

    if (this._replaced !== null) {
      return this._beforeContent + this._replaced + this._afterContent;
    }

    let result = this._beforeContent;

    if (!this._removeTags) {
      result += `<${this.tagName}`;
      for (const [name, value] of Object.entries(this._attributes)) {
        result += ` ${name}="${escapeAttribute(value)}"`;
      }
      result += '>';
    }

    result += this._prependContent;

    if (this._innerContent !== null) {
      result += this._innerContent;
    }
    // Note: Original content would need to be tracked separately

    result += this._appendContent;

    // End tag handling would require tracking until we see the closing tag

    return result;
  }
}

// Helper functions
function parseSelector(selector) {
  const info = {
    tagName: null,
    classes: [],
    id: null,
    attributes: []
  };

  // Parse tag name
  const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  if (tagMatch) {
    info.tagName = tagMatch[1].toLowerCase();
  }

  // Parse classes
  const classMatches = selector.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
  for (const match of classMatches) {
    info.classes.push(match[1]);
  }

  // Parse ID
  const idMatch = selector.match(/#([a-zA-Z_-][a-zA-Z0-9_-]*)/);
  if (idMatch) {
    info.id = idMatch[1];
  }

  // Parse attribute selectors
  const attrMatches = selector.matchAll(/\[([^\]]+)\]/g);
  for (const match of attrMatches) {
    const attrExpr = match[1];

    if (attrExpr.includes('=')) {
      const [attrName, ...valueParts] = attrExpr.split('=');
      const attrValue = valueParts.join('=').replace(/^["']|["']$/g, '');

      if (attrName.endsWith('^')) {
        info.attributes.push({
          name: attrName.slice(0, -1),
          value: attrValue,
          operator: 'startsWith'
        });
      } else if (attrName.endsWith('$')) {
        info.attributes.push({
          name: attrName.slice(0, -1),
          value: attrValue,
          operator: 'endsWith'
        });
      } else if (attrName.endsWith('*')) {
        info.attributes.push({
          name: attrName.slice(0, -1),
          value: attrValue,
          operator: 'contains'
        });
      } else {
        info.attributes.push({
          name: attrName,
          value: attrValue,
          operator: 'equals'
        });
      }
    } else {
      info.attributes.push({
        name: attrExpr,
        operator: 'exists'
      });
    }
  }

  return info;
}

function parseAttributes(attrString) {
  const attributes = {};
  const regex = /([a-zA-Z_-][a-zA-Z0-9_-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;

  while ((match = regex.exec(attrString)) !== null) {
    const name = match[1];
    const value = match[2] || match[3] || match[4] || '';
    attributes[name] = value;
  }

  return attributes;
}

function matchesSelector(tagName, attributesString, selectorInfo) {
  // Check tag name
  if (selectorInfo.tagName && selectorInfo.tagName !== '*') {
    if (tagName.toLowerCase() !== selectorInfo.tagName) {
      return false;
    }
  }

  const attrs = parseAttributes(attributesString);

  // Check ID
  if (selectorInfo.id && attrs.id !== selectorInfo.id) {
    return false;
  }

  // Check classes
  const classes = (attrs.class || '').split(/\s+/);
  for (const className of selectorInfo.classes) {
    if (!classes.includes(className)) {
      return false;
    }
  }

  // Check attributes
  for (const attrReq of selectorInfo.attributes) {
    const attrValue = attrs[attrReq.name];

    switch (attrReq.operator) {
      case 'exists':
        if (!(attrReq.name in attrs)) return false;
        break;
      case 'equals':
        if (attrValue !== attrReq.value) return false;
        break;
      case 'startsWith':
        if (!attrValue || !attrValue.startsWith(attrReq.value)) return false;
        break;
      case 'endsWith':
        if (!attrValue || !attrValue.endsWith(attrReq.value)) return false;
        break;
      case 'contains':
        if (!attrValue || !attrValue.includes(attrReq.value)) return false;
        break;
    }
  }

  return true;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

export { UnifiedHTMLRewriter };
```

### Usage Example

```javascript
// main.js
import { UnifiedHTMLRewriter } from './unified-html-rewriter.js';

// Detect platform
const PLATFORM = typeof HTMLRewriter !== 'undefined' ? 'cloudflare' : 'fastly';

// Cloudflare Worker
export default {
  async fetch(request, env) {
    const response = await fetch(request);

    // Check if response is HTML
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return response;
    }

    return new UnifiedHTMLRewriter(PLATFORM)
      .on('head', {
        element(element) {
          // Inject meta tag
          element.prepend(
            '<meta name="edge-processed" content="true">',
            { html: true }
          );

          // Inject script
          element.append(
            '<script src="/edge-worker.js" defer></script>',
            { html: true }
          );
        }
      })
      .on('a[href^="http://"]', {
        element(element) {
          // Upgrade insecure links
          const href = element.getAttribute('href');
          element.setAttribute('href', href.replace('http://', 'https://'));
        }
      })
      .on('img:not([loading])', {
        element(element) {
          // Add lazy loading
          element.setAttribute('loading', 'lazy');
        }
      })
      .on('script:not([nonce])', {
        element(element) {
          // Add CSP nonce
          element.setAttribute('nonce', env.CSP_NONCE || 'generated-nonce');
        }
      })
      .on('.personalized-greeting', {
        element(element) {
          // Personalization
          const country = request.cf?.country || 'US';
          element.setInnerContent(`Hello visitor from ${country}!`);
        }
      })
      .onDocument({
        end(end) {
          // Append processing marker
          end.append(
            `\n<!-- Processed at edge: ${new Date().toISOString()} -->`,
            { html: true }
          );
        }
      })
      .transform(response);
  }
};

// Fastly Compute
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event));
});

async function handleRequest(event) {
  const request = event.request;
  const response = await fetch(request, { backend: 'origin' });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const geo = event.client.geo;

  return new UnifiedHTMLRewriter('fastly')
    .on('head', {
      element(element) {
        element.prepend(
          '<meta name="edge-processed" content="true">',
          { html: true }
        );
        element.append(
          '<script src="/edge-worker.js" defer></script>',
          { html: true }
        );
      }
    })
    .on('a[href^="http://"]', {
      element(element) {
        const href = element.getAttribute('href');
        element.setAttribute('href', href.replace('http://', 'https://'));
      }
    })
    .on('img', {
      element(element) {
        if (!element.hasAttribute('loading')) {
          element.setAttribute('loading', 'lazy');
        }
      }
    })
    .on('.personalized-greeting', {
      element(element) {
        const country = geo?.country_code || 'US';
        element.setInnerContent(`Hello visitor from ${country}!`);
      }
    })
    .transform(response);
}
```

---

## Common Use Cases

### 1. Analytics and Tracking Injection

```javascript
const rewriter = new UnifiedHTMLRewriter(PLATFORM)
  .on('head', {
    element(element) {
      element.append(`
        <script>
          (function() {
            // Analytics code
            window.dataLayer = window.dataLayer || [];
            dataLayer.push({ event: 'page_view', timestamp: Date.now() });
          })();
        </script>
      `, { html: true });
    }
  });
```

### 2. A/B Testing

```javascript
const variant = Math.random() < 0.5 ? 'A' : 'B';

const rewriter = new UnifiedHTMLRewriter(PLATFORM)
  .on('.cta-button', {
    element(element) {
      if (variant === 'B') {
        element.setAttribute('class', 'cta-button variant-b');
        element.setInnerContent('Try It Free!');
      }
    }
  })
  .on('body', {
    element(element) {
      element.setAttribute('data-variant', variant);
    }
  });
```

### 3. Content Security Policy Nonce Injection

```javascript
const nonce = generateSecureNonce();

const rewriter = new UnifiedHTMLRewriter(PLATFORM)
  .on('script', {
    element(element) {
      if (!element.getAttribute('src')) {
        // Inline script - add nonce
        element.setAttribute('nonce', nonce);
      }
    }
  })
  .on('style', {
    element(element) {
      element.setAttribute('nonce', nonce);
    }
  })
  .on('head', {
    element(element) {
      element.prepend(
        `<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'">`,
        { html: true }
      );
    }
  });
```

### 4. Image Optimization

```javascript
const rewriter = new UnifiedHTMLRewriter(PLATFORM)
  .on('img', {
    element(element) {
      // Add lazy loading
      if (!element.hasAttribute('loading')) {
        element.setAttribute('loading', 'lazy');
      }

      // Add aspect ratio placeholder
      const width = element.getAttribute('width');
      const height = element.getAttribute('height');
      if (width && height) {
        element.setAttribute('style', `aspect-ratio: ${width}/${height};`);
      }

      // Rewrite to CDN
      const src = element.getAttribute('src');
      if (src && src.startsWith('/images/')) {
        element.setAttribute('src', `https://cdn.example.com${src}`);
      }
    }
  });
```

### 5. SEO Enhancements

```javascript
const rewriter = new UnifiedHTMLRewriter(PLATFORM)
  .on('head', {
    element(element) {
      // Add canonical URL
      element.append(
        `<link rel="canonical" href="${canonicalUrl}">`,
        { html: true }
      );

      // Add structured data
      element.append(`
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          "url": "${canonicalUrl}",
          "dateModified": "${new Date().toISOString()}"
        }
        </script>
      `, { html: true });
    }
  })
  .on('meta[name="description"]', {
    element(element) {
      // Ensure description exists and is optimized
      const content = element.getAttribute('content');
      if (!content || content.length > 160) {
        element.setAttribute('content', optimizedDescription);
      }
    }
  });
```

### 6. Localization

```javascript
const translations = {
  'en': { greeting: 'Welcome', cta: 'Buy Now' },
  'es': { greeting: 'Bienvenido', cta: 'Comprar Ahora' },
  'fr': { greeting: 'Bienvenue', cta: 'Acheter Maintenant' }
};

const userLang = detectLanguage(request);
const t = translations[userLang] || translations['en'];

const rewriter = new UnifiedHTMLRewriter(PLATFORM)
  .on('[data-i18n]', {
    element(element) {
      const key = element.getAttribute('data-i18n');
      if (t[key]) {
        element.setInnerContent(t[key]);
      }
    }
  })
  .on('html', {
    element(element) {
      element.setAttribute('lang', userLang);
    }
  });
```

---

## Performance Considerations

### Cloudflare HTMLRewriter Performance

**Advantages:**
- Written in Rust (lol-html parser)
- Minimal memory overhead (streaming)
- No JavaScript parsing overhead
- Optimized for edge environments

**Best Practices:**
- Minimize handler complexity
- Avoid regex in hot paths
- Use specific selectors (`.class` vs `*`)
- Limit number of `.on()` calls when possible
- Don't buffer content unnecessarily

**Memory Characteristics:**
- Constant memory usage regardless of HTML size
- Only active elements buffered
- Text chunks streamed incrementally

### Fastly HTML Transform Performance

**Considerations:**
- JavaScript-based parsing has overhead
- Custom implementations may buffer more
- TransformStream provides streaming benefits
- Consider using regex for simple transformations

**Optimization Strategies:**
1. Use simple string operations for basic transformations
2. Consider compile-time bundling of transformation logic
3. Profile memory usage with large documents
4. Use early termination when possible

**Memory Management:**
```javascript
// Avoid: Buffering entire document
const html = await response.text();  // Loads entire response
const transformed = html.replace(...);

// Prefer: Streaming transformation
const transformedBody = response.body.pipeThrough(transformer);
```

### General Recommendations

1. **Measure Performance**: Profile transformations with realistic HTML
2. **Limit Scope**: Only transform necessary elements
3. **Cache Selectors**: Pre-compile selector patterns
4. **Stream When Possible**: Avoid buffering entire documents
5. **Test Edge Cases**: Large documents, malformed HTML, nested structures
6. **Monitor Latency**: Track TTFB impact of transformations

```javascript
// Performance monitoring
const rewriter = new UnifiedHTMLRewriter(PLATFORM)
  .on('body', {
    element(element) {
      const startTime = Date.now();
      // Transformation logic
      const duration = Date.now() - startTime;
      console.log(`Transformation took ${duration}ms`);
    }
  });
```

---

## Limitations and Caveats

### Cloudflare HTMLRewriter Limitations

1. **Selector Support**: Not all CSS selectors supported (no `:nth-child`, limited combinators)
2. **No DOM Tree**: Cannot traverse DOM; each element processed independently
3. **Text Chunking**: Text may arrive in multiple chunks
4. **Void Elements**: Some elements are self-closing (img, br, etc.)
5. **Memory Limits**: Worker memory limits apply

### Fastly HTML Transform Limitations

1. **Experimental API**: Subject to change
2. **Less Feature-Rich**: Compared to Cloudflare's mature API
3. **Manual Implementation**: May require custom parsing logic
4. **Performance**: JavaScript-based parsing overhead
5. **Error Handling**: Malformed HTML handling varies

### Unified Adapter Limitations

1. **Lowest Common Denominator**: Some features only work on Cloudflare
2. **Performance Variance**: Fastly implementation may be slower
3. **Selector Parsing**: Custom parser may not cover all edge cases
4. **Complex Transformations**: Nested transformations challenging
5. **Testing Complexity**: Need to test on both platforms

---

## Implementation Recommendations

Based on the helix-universal adapter pattern (see [PR #426](https://github.com/adobe/helix-universal/pull/426)), here are recommendations for implementing HTML Rewriter functionality in an edge deployment plugin:

### Edge Wrapper Implementation

The following functionality should be **built into the edge wrapper itself** as core adapter features:

1. **Response Stream Handling** ✅ **Edge Wrapper**
   - Detect HTML responses automatically (Content-Type check)
   - Provide hooks for response transformation
   - Handle streaming body transformations
   - **Rationale**: Core response handling is fundamental to all edge functions
   - **Example**: Wrapper provides `context.transformResponse()` method

2. **Platform Detection for HTML Rewriter** ✅ **Edge Wrapper**
   - Detect if native HTMLRewriter is available (Cloudflare)
   - Gracefully degrade to fallback implementation (Fastly)
   - **Rationale**: Optimal performance when native APIs are available
   - **Example**: Use Cloudflare's Rust-based parser when available, fall back to JS parser

### Plugin Implementation

The following functionality should be implemented as **optional plugins** that can be composed:

1. **HTML Transformation** 🔌 **Plugin**
   - Unified `UnifiedHTMLRewriter` interface
   - CSS selector-based element matching
   - Content injection (analytics, scripts, meta tags)
   - **Rationale**: Not all edge functions need HTML transformation; opt-in via plugin
   - **Example**: `@adobe/helix-edge-html` plugin adds `context.html.rewriter()`
   - **Usage**:
     ```javascript
     export const handler = edge
       .with(htmlPlugin)
       .wrap(async (request, context) => {
         const response = await fetch(request);

         return context.html.rewriter()
           .on('head', {
             element(el) {
               el.append('<script src="/analytics.js"></script>', { html: true });
             }
           })
           .transform(response);
       });
     ```

2. **Common Transformations** 🔌 **Plugin**
   - Pre-built transformation plugins for common use cases:
     - Analytics injection → `@adobe/helix-edge-analytics`
     - CSP nonce injection → `@adobe/helix-edge-csp`
     - Link rewriting → `@adobe/helix-edge-links`
     - Image optimization → `@adobe/helix-edge-images`
   - **Rationale**: Reusable transformations reduce boilerplate
   - **Example**:
     ```javascript
     export const handler = edge
       .with(analyticsPlugin, { trackingId: 'UA-XXXXX' })
       .with(cspPlugin, { generateNonce: true })
       .with(linkRewriterPlugin, { upgradeHttp: true })
       .wrap(async (request, context) => {
         // Transformations applied automatically
         return fetch(request);
       });
     ```

3. **A/B Testing and Personalization** 🔌 **Plugin**
   - Variant selection and content replacement
   - User segmentation and targeting
   - Experiment tracking
   - **Rationale**: Complex feature requiring state management
   - **Example**: `@adobe/helix-edge-experimentation` plugin
   - **Usage**:
     ```javascript
     export const handler = edge
       .with(experimentationPlugin, {
         experiments: {
           'cta-button': {
             variants: ['control', 'variant-a', 'variant-b'],
             selector: '.cta-button',
           }
         }
       })
       .wrap(async (request, context) => {
         // Variant applied automatically via HTML transformation
         return fetch(request);
       });
     ```

### Import/Polyfill Implementation

The following functionality should be provided as **imports or polyfills**:

1. **HTML Parser Libraries** 📦 **Import/Polyfill**
   - `htmlparser2` for Fastly (JavaScript-based parser)
   - Polyfill HTMLRewriter API on Fastly
   - **Rationale**: Fastly lacks native HTMLRewriter; polyfill provides compatibility
   - **Example**: `@adobe/helix-edge-html-polyfill` provides HTMLRewriter on Fastly
   - **Usage**:
     ```javascript
     import '@adobe/helix-edge-html-polyfill'; // Polyfills HTMLRewriter on Fastly

     export async function main(request, context) {
       const response = await fetch(request);

       return new HTMLRewriter()
         .on('head', {
           element(el) {
             el.append('<meta name="generator" content="Helix">');
           }
         })
         .transform(response);
     }
     ```

2. **CSS Selector Utilities** 📦 **Import**
   - CSS selector parsing and matching
   - Element traversal helpers
   - **Rationale**: Useful for custom transformations
   - **Example**: `css-select` or `cheerio` for server-side DOM manipulation

3. **Template Engines** 📦 **Import**
   - For more complex HTML generation
   - Mustache, Handlebars, etc.
   - **Rationale**: Application-level concerns
   - **Example**: Import and use directly in transformation logic

### Context HTML API

The edge wrapper should provide HTML transformation hooks in the context:

```javascript
interface UnifiedContext {
  // HTML transformation utilities (plugin: @adobe/helix-edge-html)
  html?: {
    // Create a new rewriter
    rewriter(): UnifiedHTMLRewriter;

    // Detect if response is HTML
    isHtmlResponse(response: Response): boolean;

    // Apply transformation to response
    transform(response: Response, transformer: (rewriter: UnifiedHTMLRewriter) => void): Response;
  };

  // A/B testing and experiments (plugin: @adobe/helix-edge-experimentation)
  experiment?: {
    variant(experimentName: string): string;
    track(experimentName: string, event: string): void;
  };

  // CSP nonce generation (plugin: @adobe/helix-edge-csp)
  csp?: {
    nonce: string;
    addNonce(element: Element): void;
  };
}
```

### Performance Considerations

HTML transformation can be expensive; the wrapper should provide optimization features:

1. **Conditional Transformation** ✅ **Edge Wrapper**
   - Only transform HTML responses (check Content-Type)
   - Skip transformation for non-HTML or already-transformed responses
   - **Example**:
     ```javascript
     async function transformResponse(response, context) {
       if (!context.html.isHtmlResponse(response)) {
         return response; // Pass through non-HTML
       }
       return applyTransformations(response, context);
     }
     ```

2. **Streaming Optimization** ✅ **Edge Wrapper**
   - Use native HTMLRewriter on Cloudflare (Rust-based, fast)
   - Use efficient streaming parser on Fastly
   - Never buffer entire HTML document
   - **Example**: Wrapper automatically selects optimal implementation

3. **Transformation Caching** 🔌 **Plugin**
   - Cache transformed HTML at edge
   - Invalidate on content changes
   - **Example**: `@adobe/helix-edge-cache` plugin with HTML-aware caching

### Example: Complete HTML Transformation Setup

```javascript
import { edge } from '@adobe/helix-deploy-plugin-edge';
import htmlPlugin from '@adobe/helix-edge-html';
import analyticsPlugin from '@adobe/helix-edge-analytics';
import cspPlugin from '@adobe/helix-edge-csp';

export const handler = edge
  .with(htmlPlugin)
  .with(analyticsPlugin, { trackingId: process.env.GA_ID })
  .with(cspPlugin)
  .wrap(async (request, context) => {
    const response = await fetch(request, {
      backend: 'origin'
    });

    // Check if HTML response
    if (!context.html.isHtmlResponse(response)) {
      return response;
    }

    // Apply custom transformations
    return context.html.transform(response, (rewriter) => {
      rewriter
        .on('head', {
          element(el) {
            // Add custom meta tags
            el.prepend(`<meta name="edge-processed" content="true">`, { html: true });
          }
        })
        .on('img', {
          element(el) {
            // Lazy load images
            if (!el.hasAttribute('loading')) {
              el.setAttribute('loading', 'lazy');
            }

            // Rewrite CDN URLs
            const src = el.getAttribute('src');
            if (src && src.startsWith('/images/')) {
              el.setAttribute('src', `https://cdn.example.com${src}`);
            }
          }
        })
        .on('a[href^="http://"]', {
          element(el) {
            // Upgrade insecure links
            const href = el.getAttribute('href');
            el.setAttribute('href', href.replace('http://', 'https://'));
          }
        })
        .on('.personalized', {
          element(el) {
            // Personalization based on geo
            const country = context.geo?.countryCode || 'US';
            el.setInnerContent(`Content for ${country}`);
          }
        });
    });
  });
```

### Platform-Specific Optimizations

**Cloudflare-Specific:**
- Use native `HTMLRewriter` (Rust-based lol-html parser)
- Leverage full CSS selector support
- Minimal performance overhead

**Fastly-Specific:**
- Use JavaScript-based parser (htmlparser2 or custom)
- Optimize selector matching (avoid complex selectors)
- Consider simple regex-based transformations for basic cases

**Graceful Degradation:**
```javascript
// Plugin automatically detects platform and uses optimal implementation
export const handler = edge
  .with(htmlPlugin, {
    // Use simple transformations on Fastly for better performance
    fastlyOptimizations: true,
    // Use full-featured rewriter on Cloudflare
    cloudflareNative: true
  })
  .wrap(async (request, context) => {
    return context.html.transform(response, (rewriter) => {
      // Transformations work on both platforms
      rewriter.on('title', { /* ... */ });
    });
  });
```

---

## References

### Cloudflare Documentation
- [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)
- [lol-html (underlying parser)](https://github.com/nickreese/lol-html)
- [HTMLRewriter Examples](https://developers.cloudflare.com/workers/examples/rewrite-links/)

### Fastly Documentation
- [Fastly Compute JavaScript Reference](https://js-compute-reference-docs.edgecompute.app/)
- [TransformStream](https://js-compute-reference-docs.edgecompute.app/docs/globals/TransformStream)
- [Body Streaming](https://js-compute-reference-docs.edgecompute.app/docs/globals/Body)

### Related Resources
- [htmlparser2 (JavaScript HTML Parser)](https://github.com/fb55/htmlparser2)
- [parse5 (HTML5 Parser)](https://github.com/inikulin/parse5)
- [Web Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)

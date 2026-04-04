/**
 * Google Shopping XML feed parser + in-memory cache.
 * Streams the XML to extract <g:id> values without loading the entire DOM.
 */

import sax from 'sax';

// In-memory cache: siteId → Set of product IDs
const feedCache = new Map<string, Set<string>>();
// Track which URLs are currently being loaded (dedup concurrent requests)
const loadingPromises = new Map<string, Promise<Set<string>>>();

/**
 * Fetch and parse a Google Shopping XML feed, extracting all <g:id> values.
 * Returns a Set of product ID strings.
 */
async function parseFeed(feedUrl: string): Promise<Set<string>> {
  const ids = new Set<string>();

  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();

  return new Promise<Set<string>>((resolve, reject) => {
    const parser = sax.parser(false, { lowercase: true });
    let insideGId = false;
    let currentText = '';

    parser.onopentag = (node) => {
      if (node.name === 'g:id') {
        insideGId = true;
        currentText = '';
      }
    };

    parser.ontext = (text) => {
      if (insideGId) currentText += text;
    };

    parser.oncdata = (cdata) => {
      if (insideGId) currentText += cdata;
    };

    parser.onclosetag = (name) => {
      if (name === 'g:id') {
        const trimmed = currentText.trim();
        if (trimmed) ids.add(trimmed);
        insideGId = false;
        currentText = '';
      }
    };

    parser.onend = () => resolve(ids);
    parser.onerror = (err) => reject(err);

    parser.write(xml).close();
  });
}

/**
 * Load feed for a site (with dedup). Caches the result.
 */
export async function loadFeed(siteId: string, feedUrl: string): Promise<Set<string>> {
  // Return cached if available
  const cached = feedCache.get(siteId);
  if (cached) return cached;

  // Dedup concurrent loads for the same site
  const existing = loadingPromises.get(siteId);
  if (existing) return existing;

  const promise = parseFeed(feedUrl).then((ids) => {
    feedCache.set(siteId, ids);
    loadingPromises.delete(siteId);
    console.log(`[Feed] Loaded ${ids.size} product IDs for ${siteId}`);
    return ids;
  }).catch((err) => {
    loadingPromises.delete(siteId);
    throw err;
  });

  loadingPromises.set(siteId, promise);
  return promise;
}

/**
 * Force reload feed for a site.
 */
export async function reloadFeed(siteId: string, feedUrl: string): Promise<Set<string>> {
  feedCache.delete(siteId);
  loadingPromises.delete(siteId);
  return loadFeed(siteId, feedUrl);
}

/**
 * Check if a product ID exists in the cached feed for a site.
 * Returns null if no feed is loaded (caller should load first).
 */
export function checkProductId(siteId: string, productId: string): boolean | null {
  const cached = feedCache.get(siteId);
  if (!cached) return null;
  return cached.has(productId);
}

/**
 * Get the count of products in the cached feed.
 */
export function getFeedInfo(siteId: string): { loaded: boolean; productCount: number } {
  const cached = feedCache.get(siteId);
  if (!cached) return { loaded: false, productCount: 0 };
  return { loaded: true, productCount: cached.size };
}

/**
 * Invalidate the feed cache for a site.
 */
export function invalidateFeedCache(siteId: string): void {
  feedCache.delete(siteId);
}

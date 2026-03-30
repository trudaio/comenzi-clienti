import type { ICredentials, IOrderRow } from '../../shared/types.js';
import type { IConnector, IRawOrder, IFetchResult } from './connector.interface.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const RATE_LIMIT_DELAY_MS = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Build WooCommerce REST API v3 base URL from the site URL */
function buildBaseUrl(apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, '');
  // If the URL already contains /wp-json/wc, use as-is
  if (base.includes('/wp-json/wc')) return base;
  return `${base}/wp-json/wc/v3`;
}

/** Build Basic Auth header from consumer key + consumer secret */
function buildAuthHeader(credentials: ICredentials): string {
  const token = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret || ''}`).toString(
    'base64',
  );
  return `Basic ${token}`;
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
): Promise<{ body: unknown; totalPages: number; totalItems: number }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) {
      const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10);
      const totalItems = parseInt(res.headers.get('x-wp-total') || '0', 10);
      const body = await res.json();
      return { body, totalPages, totalItems };
    }
    if (attempt < MAX_RETRIES - 1) {
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    } else {
      const text = await res.text();
      throw new Error(`WooCommerce API ${res.status}: ${text.substring(0, 300)}`);
    }
  }
  throw new Error('Unreachable');
}

export class WooCommerceConnector implements IConnector {
  async fetchOrders(credentials: ICredentials, sinceDate?: string): Promise<IFetchResult> {
    const baseUrl = buildBaseUrl(credentials.apiUrl);
    const headers = {
      Authorization: buildAuthHeader(credentials),
      'Content-Type': 'application/json',
    };

    const allOrders: IRawOrder[] = [];
    let page = 1;
    let totalAvailable = 0;

    while (page <= MAX_PAGES) {
      let url = `${baseUrl}/orders?per_page=${PAGE_SIZE}&page=${page}&orderby=date&order=desc`;
      if (sinceDate) {
        url += `&after=${sinceDate}`;
      }

      const { body, totalItems } = await fetchWithRetry(url, headers);

      if (page === 1) {
        totalAvailable = totalItems;
      }

      const batch = Array.isArray(body) ? (body as IRawOrder[]) : [];
      if (batch.length === 0) break;

      allOrders.push(...batch);

      if (batch.length < PAGE_SIZE) break;

      page++;
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    return { orders: allOrders, totalAvailable };
  }

  flattenOrder(raw: IRawOrder, sourceSite: string): IOrderRow[] {
    const orderId = String(raw.id || raw.number || '');
    const orderDate = String(raw.date_created || raw.date_created_gmt || '');
    const orderStatus = String(raw.status || '');
    const orderTotal =
      parseFloat(String(raw.total || '0').replace(/[^0-9.-]+/g, '')) || 0;
    const currency = String(raw.currency || 'RON');

    const items = raw.line_items as Record<string, unknown>[] | undefined;

    if (!Array.isArray(items) || items.length === 0) {
      return [
        {
          order_id: orderId,
          order_date: orderDate,
          order_status: orderStatus,
          order_total: Math.round(orderTotal * 100) / 100,
          currency,
          product_id: '',
          product_sku: '',
          product_name: '',
          product_price: 0,
          product_quantity: 0,
          product_total: 0,
          source_site: sourceSite,
          synced_at: new Date().toISOString(),
        },
      ];
    }

    const rows: IOrderRow[] = [];

    for (const item of items) {
      const price = parseFloat(String(item.price || '0').replace(/[^0-9.-]+/g, '')) || 0;
      const qty = parseFloat(String(item.quantity || '0')) || 0;
      const lineTotal = parseFloat(String(item.total || '0').replace(/[^0-9.-]+/g, '')) || 0;

      rows.push({
        order_id: orderId,
        order_date: orderDate,
        order_status: orderStatus,
        order_total: Math.round(orderTotal * 100) / 100,
        currency,
        product_id: String(item.product_id || ''),
        product_sku: String(item.sku || ''),
        product_name: String(item.name || ''),
        product_price: Math.round(price * 100) / 100,
        product_quantity: qty,
        product_total: Math.round(lineTotal * 100) / 100,
        source_site: sourceSite,
        synced_at: new Date().toISOString(),
      });
    }

    return rows;
  }

  async fetchSample(credentials: ICredentials, limit = 2): Promise<IRawOrder[]> {
    const baseUrl = buildBaseUrl(credentials.apiUrl);
    const headers = {
      Authorization: buildAuthHeader(credentials),
      'Content-Type': 'application/json',
    };

    const url = `${baseUrl}/orders?per_page=${limit}&page=1&orderby=date&order=desc`;
    const { body } = await fetchWithRetry(url, headers);
    return Array.isArray(body) ? (body as IRawOrder[]) : [];
  }
}

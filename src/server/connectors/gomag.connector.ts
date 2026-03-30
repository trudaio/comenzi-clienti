import type { ICredentials, IOrderRow } from '../../shared/types.js';
import type { IConnector, IRawOrder, IFetchResult } from './connector.interface.js';

const GOMAG_API_BASE = 'https://api.gomag.ro/api/v1/order/read/json';
const PAGE_SIZE = 50;
const MAX_PAGES = 200;
const RATE_LIMIT_DELAY_MS = 300;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract the domain (ApiShop header value) from the credential's apiUrl */
function extractDomain(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    return url.hostname;
  } catch {
    return apiUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) {
      return res.json();
    }
    if (attempt < MAX_RETRIES - 1) {
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    } else {
      const text = await res.text();
      throw new Error(`GoMag API ${res.status}: ${text.substring(0, 200)}`);
    }
  }
  throw new Error('Unreachable');
}

function parseOrdersFromResponse(response: unknown): IRawOrder[] {
  if (!response || typeof response !== 'object') return [];
  const resp = response as Record<string, unknown>;

  if (resp.orders) {
    const val = resp.orders;
    if (Array.isArray(val)) return val as IRawOrder[];
    if (typeof val === 'object' && val !== null) return Object.values(val) as IRawOrder[];
  }
  if (Array.isArray(response)) return response as IRawOrder[];
  return [];
}

export class GomagConnector implements IConnector {
  async fetchOrders(credentials: ICredentials, sinceDate?: string): Promise<IFetchResult> {
    const domain = extractDomain(credentials.apiUrl);
    const headers = {
      Apikey: credentials.apiKey,
      ApiShop: domain,
      'Content-Type': 'application/json',
    };

    const sinceTs = sinceDate ? new Date(sinceDate).getTime() : 0;
    const allOrders: IRawOrder[] = [];
    let page = 1;
    let totalAvailable = 0;

    while (page <= MAX_PAGES) {
      const url = `${GOMAG_API_BASE}?limit=${PAGE_SIZE}&page=${page}`;
      const response = (await fetchWithRetry(url, headers)) as Record<string, unknown>;

      if (page === 1 && response.total) {
        totalAvailable = parseInt(String(response.total), 10) || 0;
      }

      const batch = parseOrdersFromResponse(response);
      if (batch.length === 0) break;

      let hitOldOrders = false;
      for (const order of batch) {
        const dateStr = order.date as string | undefined;
        if (!dateStr) continue;
        const orderTs = new Date(dateStr).getTime();

        if (sinceTs > 0 && orderTs < sinceTs) {
          hitOldOrders = true;
          break;
        }
        allOrders.push(order);
      }

      if (hitOldOrders) break;

      page++;
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    return { orders: allOrders, totalAvailable };
  }

  flattenOrder(raw: IRawOrder, sourceSite: string): IOrderRow[] {
    const orderId = String(raw.number || raw.id || '');
    const orderDate = String(raw.date || '');
    const orderStatus = String(raw.status || '');
    const orderTotal = parseFloat(String(raw.total || '0').replace(/[^0-9.-]+/g, '')) || 0;
    const currency = String(raw.currency || 'RON');
    let items = (raw.items || raw.products || raw.line_items) as unknown;
    if (items && !Array.isArray(items) && typeof items === 'object') {
      items = Object.values(items);
    }
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

    for (const item of items as Record<string, unknown>[]) {
      if (item.type === 'service') continue;

      const price = parseFloat(String(item.price || '0').replace(/[^0-9.-]+/g, '')) || 0;
      const qty = parseFloat(String(item.quantity || item.qty || '0')) || 0;

      rows.push({
        order_id: orderId,
        order_date: orderDate,
        order_status: orderStatus,
        order_total: Math.round(orderTotal * 100) / 100,
        currency,
        product_id: String(item.id || item.product_id || ''),
        product_sku: String(item.sku || ''),
        product_name: String(item.name || ''),
        product_price: Math.round(price * 100) / 100,
        product_quantity: qty,
        product_total: Math.round(price * qty * 100) / 100,
        source_site: sourceSite,
        synced_at: new Date().toISOString(),
      });
    }

    return rows.length > 0 ? rows : [
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

  async fetchSample(credentials: ICredentials, limit = 2): Promise<IRawOrder[]> {
    const domain = extractDomain(credentials.apiUrl);
    const headers = {
      Apikey: credentials.apiKey,
      ApiShop: domain,
      'Content-Type': 'application/json',
    };

    const url = `${GOMAG_API_BASE}?limit=${limit}&page=1`;
    const response = await fetchWithRetry(url, headers);
    return parseOrdersFromResponse(response);
  }
}

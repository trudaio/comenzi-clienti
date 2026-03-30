import type { ICredentials, IOrderRow } from '../../shared/types.js';
import type { IConnector, IRawOrder, IFetchResult } from './connector.interface.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const RATE_LIMIT_DELAY_MS = 300; // 4 req/sec safe margin
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Build the API base URL from the store URL */
function buildApiBase(apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, '');
  return `${base}/api/v2`;
}

/** Build Basic Auth header from apiKey:apiSecret */
function buildAuthHeader(credentials: ICredentials): Record<string, string> {
  const token = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret || ''}`).toString(
    'base64',
  );
  return {
    Authorization: `Basic ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<unknown> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers });

    if (res.status === 429 && attempt < MAX_RETRIES - 1) {
      // Rate limited — wait longer
      await sleep(RETRY_DELAY_MS * (attempt + 2));
      continue;
    }

    if (res.ok) {
      return res.json();
    }

    if (attempt < MAX_RETRIES - 1) {
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    } else {
      const text = await res.text();
      throw new Error(`MerchantPro API ${res.status}: ${text.substring(0, 200)}`);
    }
  }
  throw new Error('Unreachable');
}

export class MerchantProConnector implements IConnector {
  async fetchOrders(credentials: ICredentials, sinceDate?: string): Promise<IFetchResult> {
    const apiBase = buildApiBase(credentials.apiUrl);
    const headers = buildAuthHeader(credentials);
    const allOrders: IRawOrder[] = [];
    let start = 0;
    let totalAvailable = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      let url = `${apiBase}/orders?start=${start}&limit=${PAGE_SIZE}`;
      if (sinceDate) {
        url += `&created_after=${sinceDate}`;
      }

      const response = (await fetchWithRetry(url, headers)) as Record<string, unknown>;

      // Extract total from first page if available
      if (page === 0 && response.total) {
        totalAvailable = parseInt(String(response.total), 10) || 0;
      }

      // Parse orders from response
      let batch: IRawOrder[] = [];
      if (Array.isArray(response)) {
        batch = response as IRawOrder[];
      } else if (response.data && Array.isArray(response.data)) {
        batch = response.data as IRawOrder[];
      } else if (response.orders && Array.isArray(response.orders)) {
        batch = response.orders as IRawOrder[];
      }

      if (batch.length === 0) break;

      allOrders.push(...batch);

      // If we got fewer than PAGE_SIZE, we're on the last page
      if (batch.length < PAGE_SIZE) break;

      start += PAGE_SIZE;
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    return { orders: allOrders, totalAvailable: totalAvailable || allOrders.length };
  }

  flattenOrder(raw: IRawOrder, sourceSite: string): IOrderRow[] {
    const orderId = String(raw.id || '');
    const orderDate = String(raw.date_created || raw.created_at || '');
    const orderStatus = String(raw.shipping_status || raw.status || '');
    const orderTotal =
      parseFloat(String(raw.total_amount || raw.total || '0').replace(/[^0-9.-]+/g, '')) || 0;
    const currency = String(raw.currency || 'RON');

    const items = raw.line_items as unknown;
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
      const price =
        parseFloat(
          String(item.unit_price_gross || item.unit_price_net || item.price || '0').replace(
            /[^0-9.-]+/g,
            '',
          ),
        ) || 0;
      const qty = parseFloat(String(item.quantity || '0')) || 0;
      const lineTotal =
        parseFloat(
          String(item.line_subtotal_gross || item.line_subtotal_net || '0').replace(
            /[^0-9.-]+/g,
            '',
          ),
        ) || 0;

      rows.push({
        order_id: orderId,
        order_date: orderDate,
        order_status: orderStatus,
        order_total: Math.round(orderTotal * 100) / 100,
        currency,
        product_id: String(item.product_id || ''),
        product_sku: String(item.product_sku || item.sku || ''),
        product_name: String(item.product_name || item.name || ''),
        product_price: Math.round(price * 100) / 100,
        product_quantity: qty,
        product_total: Math.round((lineTotal || price * qty) * 100) / 100,
        source_site: sourceSite,
        synced_at: new Date().toISOString(),
      });
    }

    return rows.length > 0
      ? rows
      : [
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
    const apiBase = buildApiBase(credentials.apiUrl);
    const headers = buildAuthHeader(credentials);
    const url = `${apiBase}/orders?start=0&limit=${limit}`;
    const response = (await fetchWithRetry(url, headers)) as unknown;

    if (Array.isArray(response)) return response as IRawOrder[];
    const resp = response as Record<string, unknown>;
    if (resp.data && Array.isArray(resp.data)) return resp.data as IRawOrder[];
    if (resp.orders && Array.isArray(resp.orders)) return resp.orders as IRawOrder[];
    return [];
  }
}

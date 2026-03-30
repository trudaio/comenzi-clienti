import type { ICredentials, IOrderRow } from '../../shared/types.js';

export interface IRawOrder {
  [key: string]: unknown;
}

export interface IFetchResult {
  orders: IRawOrder[];
  totalAvailable: number;
}

export interface IConnector {
  /** Fetch orders from the platform API, optionally since a given date */
  fetchOrders(credentials: ICredentials, sinceDate?: string): Promise<IFetchResult>;

  /** Convert a single raw API order into flat IOrderRow[] (one per line item) */
  flattenOrder(raw: IRawOrder, sourceSite: string): IOrderRow[];

  /** Fetch a small sample (1-5 orders) for column detection */
  fetchSample(credentials: ICredentials, limit?: number): Promise<IRawOrder[]>;
}

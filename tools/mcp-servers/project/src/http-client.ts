import type { AtlasConfig } from './config.js';

export interface HttpSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

export interface HttpError {
  ok: false;
  status: number;
  message: string;
  errors?: Record<string, string[]>;
}

export type HttpResult<T> = HttpSuccess<T> | HttpError;

type QueryParams = Record<string, string | number | boolean | undefined | null>;

export class AtlasHttpClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: AtlasConfig) {
    this.baseUrl = config.apiUrl;
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${config.apiToken}`,
    };
    if (config.tenantId !== null) {
      this.headers['X-Tenant-ID'] = config.tenantId;
    }
  }

  async get<T>(path: string, params?: QueryParams): Promise<HttpResult<T>> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          sp.set(key, String(value));
        }
      }
      const qs = sp.toString();
      if (qs) url = `${url}?${qs}`;
    }
    return this.request<T>('GET', url, undefined);
  }

  async post<T>(path: string, body?: unknown): Promise<HttpResult<T>> {
    return this.request<T>('POST', `${this.baseUrl}${path}`, body);
  }

  async put<T>(path: string, body?: unknown): Promise<HttpResult<T>> {
    return this.request<T>('PUT', `${this.baseUrl}${path}`, body);
  }

  async delete<T>(path: string): Promise<HttpResult<T>> {
    return this.request<T>('DELETE', `${this.baseUrl}${path}`, undefined);
  }

  private async request<T>(method: string, url: string, body: unknown): Promise<HttpResult<T>> {
    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (response.status === 204) {
        return { ok: true, status: 204, data: null as T };
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        return { ok: false, status: response.status, message: `HTTP ${response.status}: non-JSON response` };
      }

      if (!response.ok) {
        const errBody = json as Record<string, unknown>;
        return {
          ok: false,
          status: response.status,
          message: (errBody.message as string) ?? `HTTP error ${response.status}`,
          errors: errBody.errors as Record<string, string[]> | undefined,
        };
      }

      return { ok: true, status: response.status, data: json as T };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      return { ok: false, status: 0, message: `Network error: ${message}` };
    }
  }
}

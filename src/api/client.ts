import { getApiBaseUrl } from './config';
import { ApiError, parseErrorResponse } from './errors';
import { parseContentDispositionFilename, type HtmlDocumentResponse } from './html';

export type AccessTokenProvider = () => Promise<string | null> | string | null;

export type QueryValue = string | number | boolean | null | undefined;

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, QueryValue | QueryValue[]>;
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  tokenProvider?: AccessTokenProvider;
  responseType?: 'json' | 'html' | 'void';
  fetcher?: typeof fetch;
};

type JsonApiRequestOptions = ApiRequestOptions & {
  responseType?: 'json';
};

type HtmlApiRequestOptions = ApiRequestOptions & {
  responseType: 'html';
};

type VoidApiRequestOptions = ApiRequestOptions & {
  responseType: 'void';
};

export function buildApiUrl(
  path: string,
  query?: ApiRequestOptions['query'],
  baseUrl = getApiBaseUrl(),
) {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const searchParams = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    const values = Array.isArray(value) ? value : [value];

    values.forEach((item) => {
      if (item === null || item === undefined) {
        return;
      }

      searchParams.append(key, String(item));
    });
  });

  const search = searchParams.toString();
  return `${normalizedBase}${normalizedPath}${search ? `?${search}` : ''}`;
}

export async function apiRequest<TResponse = unknown>(
  options: JsonApiRequestOptions,
): Promise<TResponse>;
export async function apiRequest(options: HtmlApiRequestOptions): Promise<HtmlDocumentResponse>;
export async function apiRequest(options: VoidApiRequestOptions): Promise<void>;
export async function apiRequest<TResponse = unknown>(
  options: ApiRequestOptions,
): Promise<TResponse | HtmlDocumentResponse | void> {
  const responseType = options.responseType ?? 'json';
  const headers = new Headers(options.headers);
  const token = await options.tokenProvider?.();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    signal: options.signal,
  };

  if (options.body !== undefined) {
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    init.body = options.body instanceof FormData ? options.body : JSON.stringify(options.body);
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(buildApiUrl(options.path, options.query), init);

  if (!response.ok) {
    throw await createApiError(response);
  }

  if (responseType === 'void' || response.status === 204) {
    return undefined;
  }

  if (responseType === 'html') {
    const contentDisposition = response.headers.get('Content-Disposition');

    return {
      html: await response.text(),
      contentType: response.headers.get('Content-Type') ?? 'text/html',
      contentDisposition,
      filename: parseContentDispositionFilename(contentDisposition),
    };
  }

  return (await response.json()) as TResponse;
}

async function createApiError(response: Response) {
  const contentType = response.headers.get('Content-Type') ?? '';
  const parsed = contentType.includes('application/json')
    ? parseErrorResponse(await response.json().catch(() => null))
    : null;

  return new ApiError({
    status: response.status,
    message: parsed?.message ?? response.statusText,
    errorCode: parsed?.error_code ?? null,
    details: parsed?.details ?? null,
    response,
  });
}

import type { components } from './generated/schema';

type GeneratedErrorResponse = components['schemas']['ErrorResponse'];

export type ErrorResponse = Omit<GeneratedErrorResponse, 'details'> & {
  details?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  readonly details: unknown;
  readonly response: Response;

  constructor(params: {
    status: number;
    message: string;
    errorCode: string | null;
    details: unknown;
    response: Response;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.errorCode = params.errorCode;
    this.details = params.details;
    this.response = params.response;
  }
}

export type UiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'retryable'
  | 'cancelled'
  | 'unknown';

export type UiErrorState = {
  kind: UiErrorKind;
  title: string;
  description: string;
  retryable: boolean;
};

export type FormErrorState = {
  message: string;
  fields: Array<{
    name: string;
    errors: string[];
  }>;
};

const uiErrorCopy: Record<UiErrorKind, Omit<UiErrorState, 'kind'>> = {
  unauthorized: {
    title: '登入狀態已失效',
    description: '請重新登入後繼續使用。',
    retryable: false,
  },
  forbidden: {
    title: '沒有權限執行此操作',
    description: '此操作不在目前角色或物業授權範圍內。',
    retryable: false,
  },
  'not-found': {
    title: '找不到資料',
    description: '資料可能已不存在，請返回列表重新確認。',
    retryable: false,
  },
  conflict: {
    title: '資料已被更新',
    description: '請重新載入最新資料後再試一次。',
    retryable: true,
  },
  validation: {
    title: '資料未通過檢查',
    description: '請確認表單內容後再送出。',
    retryable: false,
  },
  retryable: {
    title: '暫時無法完成操作',
    description: '系統暫時無法回應，請稍後重試。',
    retryable: true,
  },
  cancelled: {
    title: '操作已取消',
    description: '這次操作已停止，未送出變更。',
    retryable: false,
  },
  unknown: {
    title: '操作失敗',
    description: '系統無法完成操作，請稍後再試。',
    retryable: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseErrorResponse(value: unknown): ErrorResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    error_code: typeof value.error_code === 'string' ? value.error_code : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    details: isRecord(value.details) ? value.details : null,
  };
}

function getUiErrorKind(error: unknown): UiErrorKind {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'cancelled';
  }

  if (!(error instanceof ApiError)) {
    return error instanceof TypeError ? 'retryable' : 'unknown';
  }

  if (error.status === 401) {
    return 'unauthorized';
  }

  if (error.status === 403) {
    return 'forbidden';
  }

  if (error.status === 404) {
    return 'not-found';
  }

  if (error.status === 409) {
    return 'conflict';
  }

  if (error.status === 400 || error.status === 422) {
    return 'validation';
  }

  if (error.status >= 500) {
    return 'retryable';
  }

  return 'unknown';
}

export function classifyApiErrorForUi(error: unknown): UiErrorState {
  const kind = getUiErrorKind(error);

  return {
    kind,
    ...uiErrorCopy[kind],
  };
}

export function getFormErrorState(
  error: unknown,
  fieldMap: Record<string, string> = {},
): FormErrorState {
  const state = classifyApiErrorForUi(error);
  const errorCode = error instanceof ApiError ? error.errorCode : null;
  const mappedField = errorCode ? fieldMap[errorCode] : undefined;

  return {
    message: state.kind === 'validation' ? state.description : state.title,
    fields: mappedField
      ? [{
        name: mappedField,
        errors: [state.description],
      }]
      : [],
  };
}

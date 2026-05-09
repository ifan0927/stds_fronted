import type { UiErrorState } from '../api';

export type OperationFeedback = {
  type: 'success' | 'error' | 'warning';
  content: string;
};

export function getMutationSuccessFeedback(actionLabel = '變更'): OperationFeedback {
  return {
    type: 'success',
    content: `${actionLabel}已完成，正在更新資料。`,
  };
}

export function getMutationFailureFeedback(errorState: UiErrorState): OperationFeedback {
  return {
    type: errorState.kind === 'conflict' ? 'warning' : 'error',
    content: errorState.description,
  };
}

export function shouldRefetchAfterMutation(errorState?: UiErrorState) {
  return !errorState || errorState.kind === 'conflict';
}

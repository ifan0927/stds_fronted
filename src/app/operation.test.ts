import { describe, expect, it } from 'vitest';
import {
  getMutationFailureFeedback,
  getMutationSuccessFeedback,
  shouldRefetchAfterMutation,
} from './operation';

describe('operation feedback helpers', () => {
  it('uses short success feedback and keeps refetch as the default mutation policy', () => {
    expect(getMutationSuccessFeedback('儲存租約')).toEqual({
      type: 'success',
      content: '儲存租約已完成，正在更新資料。',
    });
    expect(shouldRefetchAfterMutation()).toBe(true);
  });

  it('marks conflict failures as warning feedback and refetch-worthy', () => {
    const conflict = {
      kind: 'conflict',
      title: '資料已被更新',
      description: '請重新載入最新資料後再試一次。',
      retryable: true,
    } as const;

    expect(getMutationFailureFeedback(conflict)).toEqual({
      type: 'warning',
      content: '請重新載入最新資料後再試一次。',
    });
    expect(shouldRefetchAfterMutation(conflict)).toBe(true);
  });
});

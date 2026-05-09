import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import {
  getCanonicalRoomDetailPath,
  getRoomMutationErrorCopy,
} from './roomDetail';

function apiError(status: number, errorCode: string | null) {
  return new ApiError({
    status,
    errorCode,
    message: 'backend error',
    details: null,
    response: new Response(null, { status }),
  });
}

describe('RoomDetailPage helpers', () => {
  it('redirects to the backend room property when route property context is stale', () => {
    expect(
      getCanonicalRoomDetailPath('property-a', 'room-1', {
        id: 'room-1',
        property_id: 'property-b',
        status: 'vacant',
      }),
    ).toBe('/properties/property-b/rooms/room-1');
  });

  it('keeps the current route when backend room property matches or is absent', () => {
    expect(
      getCanonicalRoomDetailPath('property-a', 'room-1', {
        id: 'room-1',
        property_id: 'property-a',
        status: 'vacant',
      }),
    ).toBeNull();

    expect(
      getCanonicalRoomDetailPath('property-a', 'room-1', {
        id: 'room-1',
        status: 'vacant',
      }),
    ).toBeNull();
  });

  it('maps room business-rule rejections to visible operator copy', () => {
    expect(getRoomMutationErrorCopy(apiError(422, 'ROOM_IS_OCCUPIED'))).toBe(
      '出租中的房間目前不能刪除或設定維修。',
    );
    expect(getRoomMutationErrorCopy(apiError(422, 'ROOM_IS_IN_MAINTENANCE'))).toBe(
      '維修中的房間目前不能刪除或重複設定維修。',
    );
  });
});

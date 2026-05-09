import { ApiError, classifyApiErrorForUi, type Room } from '../api';

export function getRoomMutationErrorCopy(error: unknown) {
  if (error instanceof ApiError) {
    if (error.errorCode === 'ROOM_IS_OCCUPIED') {
      return '出租中的房間目前不能刪除或設定維修。';
    }

    if (error.errorCode === 'ROOM_IS_IN_MAINTENANCE') {
      return '維修中的房間目前不能刪除或重複設定維修。';
    }

    if (error.errorCode === 'VALIDATION_ROOM_NAME_REQUIRED') {
      return '請輸入房間名稱。';
    }
  }

  return classifyApiErrorForUi(error).description;
}

export function getCanonicalRoomDetailPath(
  routePropertyId: string | undefined,
  routeRoomId: string | undefined,
  room: Room,
) {
  if (!room.property_id || room.property_id === routePropertyId) {
    return null;
  }

  return `/properties/${encodeURIComponent(room.property_id)}/rooms/${encodeURIComponent(room.id ?? routeRoomId ?? '')}`;
}

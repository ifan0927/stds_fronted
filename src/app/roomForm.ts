import type { CreateRoomRequest, Room, UpdateRoomRequest } from '../api';

export type RoomFormValues = {
  name?: string;
  size?: string | number | null;
  floor?: string | null;
  room_type?: string | null;
  facilities?: string | null;
  default_rent_amount?: string | number | null;
  notes?: string | null;
  zone?: string | null;
};

const nullableTextFields = ['floor', 'room_type', 'notes', 'zone'] as const;

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function facilitiesToText(facilities: Room['facilities']) {
  if (!facilities || typeof facilities !== 'object') {
    return '';
  }

  return Object.entries(facilities)
    .filter(([, value]) => value !== false && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => (value === true ? key : `${key}: ${String(value)}`))
    .join(', ');
}

export function parseFacilitiesText(value: unknown) {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, true>>((result, label) => {
      result[label] = true;
      return result;
    }, {});
}

export function getRoomInitialFormValues(room?: Room): RoomFormValues {
  return {
    name: room?.name ?? '',
    size: room?.size ?? '',
    floor: room?.floor ?? '',
    room_type: room?.room_type ?? '',
    facilities: facilitiesToText(room?.facilities),
    default_rent_amount: room?.default_rent_amount ?? '',
    notes: room?.notes ?? '',
    zone: room?.zone ?? '',
  };
}

export function buildCreateRoomRequest(values: RoomFormValues): CreateRoomRequest {
  return {
    name: normalizeText(values.name),
    size: normalizeNumber(values.size),
    floor: normalizeText(values.floor) || null,
    room_type: normalizeText(values.room_type) || null,
    facilities: parseFacilitiesText(values.facilities),
    default_rent_amount: normalizeNumber(values.default_rent_amount),
    notes: normalizeText(values.notes) || null,
    zone: normalizeText(values.zone) || null,
  };
}

export function buildUpdateRoomRequest(values: RoomFormValues, room: Room): UpdateRoomRequest {
  const request: UpdateRoomRequest = {};
  const nextName = normalizeText(values.name);

  if (nextName && nextName !== (room.name ?? '')) {
    request.name = nextName;
  }

  nullableTextFields.forEach((field) => {
    const nextValue = normalizeText(values[field]) || null;
    const previousValue = room[field] ?? null;

    if (nextValue !== previousValue) {
      request[field] = nextValue;
    }
  });

  const nextSize = normalizeNumber(values.size);
  if (nextSize !== (room.size ?? null)) {
    request.size = nextSize;
  }

  const nextDefaultRent = normalizeNumber(values.default_rent_amount);
  if (nextDefaultRent !== (room.default_rent_amount ?? null)) {
    request.default_rent_amount = nextDefaultRent;
  }

  const nextFacilities = parseFacilitiesText(values.facilities);
  const previousFacilitiesText = facilitiesToText(room.facilities);
  const nextFacilitiesText = facilitiesToText(nextFacilities);

  if (nextFacilitiesText !== previousFacilitiesText) {
    request.facilities = nextFacilities;
  }

  return request;
}

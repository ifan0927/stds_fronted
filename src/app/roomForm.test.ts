import { describe, expect, it } from 'vitest';
import {
  buildCreateRoomRequest,
  buildUpdateRoomRequest,
  facilitiesToText,
  getRoomInitialFormValues,
  parseFacilitiesText,
} from './roomForm';
import type { Room } from '../api';

describe('room form helpers', () => {
  it('builds create room payload with nullable empty fields', () => {
    expect(
      buildCreateRoomRequest({
        name: ' 301 室 ',
        size: '7.5',
        floor: '',
        room_type: '套房',
        facilities: '冷氣, 書桌',
        default_rent_amount: '16000',
        notes: ' ',
        zone: 'A 區',
      }),
    ).toEqual({
      name: '301 室',
      size: 7.5,
      floor: null,
      room_type: '套房',
      facilities: { 冷氣: true, 書桌: true },
      default_rent_amount: 16000,
      notes: null,
      zone: 'A 區',
    });
  });

  it('builds update room payload with omitted unchanged fields and null clear values', () => {
    const room: Room = {
      id: 'room-1',
      name: '301 室',
      status: 'vacant',
      size: 7.5,
      floor: '3F',
      room_type: '套房',
      facilities: { 冷氣: true },
      default_rent_amount: 16000,
      notes: '可帶看',
      zone: 'A 區',
    };

    expect(
      buildUpdateRoomRequest({
        name: '301 室',
        size: '8',
        floor: '',
        room_type: '套房',
        facilities: '冷氣',
        default_rent_amount: '16000',
        notes: '',
        zone: 'A 區',
      }, room),
    ).toEqual({
      size: 8,
      floor: null,
      notes: null,
    });
  });

  it('converts facilities between backend object and operator text', () => {
    expect(facilitiesToText({ 冷氣: true, 型號: 'A1', 停用: false })).toBe('冷氣, 型號: A1');
    expect(parseFacilitiesText('冷氣, 書桌, 衣櫃')).toEqual({
      冷氣: true,
      書桌: true,
      衣櫃: true,
    });
  });

  it('creates initial values from backend room data', () => {
    expect(
      getRoomInitialFormValues({
        name: '101 室',
        status: 'occupied',
        facilities: { 冷氣: true },
        default_rent_amount: 18000,
      }),
    ).toMatchObject({
      name: '101 室',
      facilities: '冷氣',
      default_rent_amount: 18000,
    });
  });
});

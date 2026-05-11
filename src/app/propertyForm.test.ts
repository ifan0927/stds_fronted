import { describe, expect, it } from 'vitest';
import {
  buildCreatePropertyRequest,
  buildUpdatePropertyRequest,
  getPropertyInitialFormValues,
  parsePropertyFacilitiesText,
  propertyFacilitiesToText,
} from './propertyForm';
import type { Property } from '../api';

describe('property form helpers', () => {
  it('builds create property payload with trimmed nullable fields and facilities', () => {
    expect(
      buildCreatePropertyRequest({
        name: ' 台北大安物業 ',
        subtitle: '  大安館 ',
        address: ' 台北市大安區復興南路一段100號 ',
        electricity_unit_price: '4.5',
        default_electricity_billing_cadence: 'monthly',
        owner_id: ' owner-1 ',
        contact_phone: '',
        contact_email: ' ',
        notes: ' 近捷運站 ',
        facilities: ' 電梯, 監視器 ',
      }),
    ).toEqual({
      name: '台北大安物業',
      subtitle: '大安館',
      address: '台北市大安區復興南路一段100號',
      electricity_unit_price: 4.5,
      default_electricity_billing_cadence: 'monthly',
      owner_id: 'owner-1',
      contact_phone: null,
      contact_email: null,
      notes: '近捷運站',
      facilities: { 電梯: true, 監視器: true },
    });
  });

  it('builds update property payload with omitted unchanged fields, nullable clear values, and number parsing', () => {
    const property: Property = {
      id: 'property-1',
      name: '台北大安物業',
      subtitle: '大安館',
      address: '台北市大安區復興南路一段100號',
      electricity_unit_price: 4.5,
      default_electricity_billing_cadence: 'monthly',
      owner_id: 'owner-1',
      contact_phone: '02-2345-6789',
      contact_email: 'owner@example.com',
      notes: '近捷運站',
      facilities: { 電梯: true, 監視器: true },
    };

    expect(
      buildUpdatePropertyRequest({
        name: '台北大安物業',
        subtitle: '',
        address: '台北市大安區復興南路一段100號',
        electricity_unit_price: '5.25',
        default_electricity_billing_cadence: 'bimonthly',
        contact_phone: '',
        contact_email: 'owner@example.com',
        notes: '近捷運站',
        facilities: '電梯, 監視器',
      }, property),
    ).toEqual({
      subtitle: null,
      electricity_unit_price: 5.25,
      default_electricity_billing_cadence: 'bimonthly',
      contact_phone: null,
    });
  });

  it('sends null when facilities are cleared on update', () => {
    const property: Property = {
      id: 'property-1',
      name: '台北大安物業',
      address: '台北市',
      electricity_unit_price: 4.5,
      default_electricity_billing_cadence: 'monthly',
      owner_id: 'owner-1',
      facilities: { 電梯: true },
    };

    expect(
      buildUpdatePropertyRequest({
        name: '台北大安物業',
        address: '台北市',
        electricity_unit_price: '4.5',
        default_electricity_billing_cadence: 'monthly',
        facilities: '',
      }, property),
    ).toEqual({
      facilities: null,
    });
  });

  it('converts facilities between backend object and operator text', () => {
    expect(propertyFacilitiesToText({ 電梯: true, 型號: 'A1', 停用: false })).toBe('電梯, 型號: A1');
    expect(parsePropertyFacilitiesText('電梯, 監視器, 信箱')).toEqual({
      電梯: true,
      監視器: true,
      信箱: true,
    });
  });

  it('creates initial values from backend property data', () => {
    expect(
      getPropertyInitialFormValues({
        name: '台北大安物業',
        address: '台北市',
        electricity_unit_price: 4.5,
        default_electricity_billing_cadence: 'bimonthly',
        owner_id: 'owner-1',
        facilities: { 電梯: true },
      }),
    ).toMatchObject({
      name: '台北大安物業',
      electricity_unit_price: 4.5,
      default_electricity_billing_cadence: 'bimonthly',
      owner_id: 'owner-1',
      facilities: '電梯',
    });
  });
});

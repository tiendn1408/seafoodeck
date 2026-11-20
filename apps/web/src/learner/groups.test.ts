import { describe, expect, it } from 'vitest';
import { groupTone } from './groups';

describe('groupTone', () => {
  it('maps groups', () => {
    expect(groupTone(null).key).toBe('none');
    expect(groupTone('crustacean').label).toBe('Giáp xác');
    expect(groupTone('fish').css).toBe('var(--group-fish)');
  });

  it('falls back to none for unknown strings and prototype keys', () => {
    expect(groupTone('mollusc').key).toBe('mollusc');
    expect(groupTone('seaweed').key).toBe('none');
    expect(groupTone('constructor')).toEqual({
      key: 'none',
      label: 'Chưa phân nhóm',
      css: 'var(--group-none)',
    });
    expect(groupTone('toString').key).toBe('none');
    expect(groupTone('__proto__').key).toBe('none');
  });
});

import { describe, expect, it } from 'vitest';
import { SKILL_COUNT_NOTE, skillLabel } from './skillLabel';

describe('skillLabel', () => {
  it('names each skill in Vietnamese', () => {
    expect(skillLabel('name:en')).toBe('Tên tiếng Anh');
    expect(skillLabel('name:ja')).toBe('Tên tiếng Nhật');
    expect(skillLabel('name:scientific')).toBe('Tên khoa học');
    expect(skillLabel('match:scientific')).toBe('Ghép Việt–khoa học');
    expect(skillLabel('hs:form')).toBe('HS theo dạng hàng');
    expect(skillLabel('image:x')).toBe('Nhận diện nguyên liệu');
    expect(skillLabel('audio:en')).toBe('Nghe và chọn tên');
  });
  it('says a species counts once it reached the 3-day step', () => {
    expect(SKILL_COUNT_NOTE).toBe('Mỗi thanh đếm loài (hoặc hồ sơ HS) đã lên mốc 3 ngày.');
  });
});

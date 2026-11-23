export function skillLabel(value: string) {
  const [type, kind] = value.split(':');
  const language = kind === 'en' ? 'Anh' : kind === 'ja' ? 'Nhật' : 'khoa học';
  return type === 'name'
    ? kind === 'scientific'
      ? 'Tên khoa học'
      : `Tên tiếng ${language}`
    : type === 'match'
      ? `Ghép Việt–${language}`
      : type === 'hs'
        ? 'HS theo dạng hàng'
        : type === 'image'
          ? 'Nhận diện nguyên liệu'
          : 'Nghe và chọn tên';
}

/**
 * What the four skill gauges count (`/me/home` and `/me/progress` skills): a species (or HS case)
 * is done once it passed its first review, i.e. reached the 3-day step (stage >= 1).
 */
export const SKILL_COUNT_NOTE = 'Mỗi thanh đếm loài (hoặc hồ sơ HS) đã lên mốc 3 ngày.';

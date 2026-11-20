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

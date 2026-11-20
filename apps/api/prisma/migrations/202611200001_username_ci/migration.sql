-- Case-insensitive unique usernames. Prisma cannot model functional indexes, so this is hand-written.
-- Stop with a clear message (and the offending names) if existing usernames collide ignoring case.
DO $$
DECLARE
  clashes text;
BEGIN
  SELECT string_agg(grp, '; ' ORDER BY grp) INTO clashes
  FROM (
    SELECT string_agg("username", ', ' ORDER BY "username") AS grp
    FROM "User"
    GROUP BY lower("username")
    HAVING count(*) > 1
  ) AS g;
  IF clashes IS NOT NULL THEN
    RAISE EXCEPTION 'Không thể áp dụng chỉ mục tên đăng nhập không phân biệt hoa thường: các tên đăng nhập sau trùng nhau khi bỏ qua hoa thường (mỗi nhóm cách nhau bằng dấu chấm phẩy): %. Hãy đổi tên một trong mỗi nhóm rồi chạy lại.', clashes;
  END IF;
END
$$;

CREATE UNIQUE INDEX "User_username_lower_key" ON "User" (lower("username"));

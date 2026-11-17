# Nguồn và tài sản — bộ demo thủy hải sản thương mại

Đối chiếu ngày 2026-11-17. Đây là hồ sơ nội bộ, không phải danh mục kinh doanh của khách hoặc phê duyệt chuyên môn. Dữ liệu runtime nằm trong `src/data/customer.ts` và `customerMedia.ts`; mọi mục vẫn draft. Các JSON truy vấn Commons chứa cả ứng viên không được chọn, không phải allowlist ảnh.

## Tên gọi và nhóm hàng

| Loài                 | Nguồn đối chiếu chính                                                                                                                                                                                                                                                                                                                                                                                               | Giới hạn                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gadus morhua         | [NOAA](https://www.fisheries.noaa.gov/species/atlantic-cod), [MAFF Nhật](https://www.maff.go.jp/j/syouan/suisan/suisan_yobo/export/attach/pdf/Vietnam-live-2.pdf), [Sea Grant Maine](https://seagrant.umaine.edu/maine-seafood-guide/cod/)                                                                                                                                                                          | Tên Việt dùng Cá tuyết kèm diễn giải Atlantic; chưa duyệt cách gọi thương mại. MAFF phân biệt タイセイヨウダラ với マダラ/G. macrocephalus                          |
| Thunnus albacares    | [Danh mục Việt Nam](https://congbao.cdnchinhphu.vn/CongBaoCP/VanBan/2024/7/42515/51348-1-2024961-96222-vbhn-bnnptnt.pdf), [NOAA](https://www.fisheries.noaa.gov/species/atlantic-yellowfin-tuna), [JAMARC](https://www.fra.go.jp/jamarc/archive/jyoho/hakusei/jr_kihada/jr_kihada.htm), [University of Hawaiʻi](https://manoa.hawaii.edu/ctahr/pacificfoodguide/index.php/chosen-from-the-sea/tuna-yellowfin-tuna/) | Tên cá ngừ có thể chỉ nhiều loài; nhãn thịt đỏ không phải định danh hoặc mã HS                                                                                      |
| Uroteuthis chinensis | [Danh mục Việt Nam](https://congbao.cdnchinhphu.vn/CongBaoCP/VanBan/2024/7/42515/51348-1-2024961-96222-vbhn-bnnptnt.pdf), [FAO Cephalopods vol. 2](https://www.fao.org/4/i1920e/i1920e.pdf), [CAA Nhật](https://www.caa.go.jp/policies/policy/food_labeling/meeting_materials/assets/food_labeling_cms201_250123_05.pdf)                                                                                            | Tên cũ Loligo chinensis có thể gặp trong hồ sơ; chưa có ảnh thích hợp đóng gói, không dùng ảnh món ăn/bảo tàng có nhãn làm câu chấm điểm                            |
| Octopus sinensis     | [Nghiên cứu định danh Gleadall 2016](https://www.jstage.jst.go.jp/article/specdiv/21/1/21_31/_article), [CAA Nhật 2025](https://www.caa.go.jp/policies/policy/food_labeling/food_labeling_act/assets/food_labeling_cms201_250328_1032.pdf)                                                                                                                                                                          | Bạch tuộc Đông Á là tên Việt diễn giải từ East Asian common octopus; chưa xác nhận tên thương mại Việt. Không đồng nhất O. sinensis và O. vulgaris bằng tài liệu cũ |
| Meretrix lyrata      | [Danh mục Việt Nam](https://congbao.cdnchinhphu.vn/CongBaoCP/VanBan/2024/7/42515/51348-1-2024961-96222-vbhn-bnnptnt.pdf), [FAO vol. 1 qua VLIZ](https://www.vliz.be/imisdocs/publications/391449.pdf), [CAA Nhật](https://www.caa.go.jp/policies/policy/food_labeling/meeting_materials/assets/food_labeling_cms202_250731_08.pdf)                                                                                  | ミスハマグリ là tên loài đối chiếu; ハマグリ là tên nhóm có thể dùng rộng. Tài liệu Nhật có chỗ viết Metetrix; bản này dùng Meretrix sau đối chiếu FAO/VN           |
| Perna viridis        | [Danh mục Việt 2017](https://congbao.chinhphu.vn/tai-ve-van-ban-so-24-2017-tt-bnnptnt-25404-20413?format=pdf), [NIES Nhật](https://www.nies.go.jp/biodiversity/invasive/DB/detail/70280.html)                                                                                                                                                                                                                       | Không dùng tên chung green mussel để nhận mọi loài Perna; dữ liệu hiện chưa người duyệt                                                                             |

Nhóm Cá/Mực & bạch tuộc/Nghêu & vẹm là cách sắp xếp nội dung học. “Thịt trắng/thịt đỏ” là thuộc tính thương mại riêng, không phải cấp phân loại. Màu thân/thịt không quyết định loài hoặc HS.

## Ảnh thật

`selected-media.json` là bảng chọn thực tế, có URL, tác giả, license, ID ảnh gốc, SHA-256 và kích thước. `src/data/customerMedia.ts` là bản tích hợp; `public/media/customer/NOTICE.txt` phân phối credit cùng app. Không cấp duyệt giả.

| Asset | Loài                   | Nguồn/tác giả              | Quyền theo hồ sơ nguồn              | File đóng gói                                                         |
| ----- | ---------------------- | -------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| r101  | Cá tuyết Đại Tây Dương | Commons, Hans-Petter Fjeld | CC BY-SA 2.5                        | JPEG nguyên byte, 2396×1312                                           |
| r102  | Cá ngừ vây vàng        | NOAA OAR/NURP qua Commons  | Public domain theo trang nguồn NOAA | JPEG nguyên byte, 1558×1106                                           |
| r103  | Vẹm xanh               | Commons, H. Zell           | CC BY-SA 3.0                        | Thumbnail Wikimedia 960×720; giữ ID ảnh gốc, không tính thành ảnh mới |
| r104  | Bạch tuộc Đông Á       | Commons, Daiju Azuma       | CC BY-SA 2.5                        | JPEG nguyên byte, 2136×2135                                           |
| r105  | Nghêu Bến Tre          | Commons, H. Zell           | CC BY-SA 3.0                        | Thumbnail Wikimedia 960×403; giữ ID ảnh gốc, không tính thành ảnh mới |

Đã xem từng ảnh để kiểm khung và nội dung nguồn; **0/5 được chuyên gia duyệt nhận diện**. Bộ Đoán hình chỉ chạy có nhãn ứng viên nội bộ. Các ảnh cho thấy dấu hiệu nhóm nhưng không thay thế định danh chuyên môn với loài gần nhau. Một số JPEG ban đầu trả HTTP 429; đã chọn nguồn khác hoặc bản thumbnail công bố sẵn, không cấu hình app fallback mạng. Ảnh mực còn thiếu.

## Minh họa AI

Ba ảnh 2D có nền alpha: `seafood-assortment-2d-v2.png` (trang học), `seafood-notebook-2d-v2.png` (thư viện), `seafood-review-2d-v2.png` (ôn tập). Tạo bằng **built-in imagegen**; prompt và SHA-256 trong `illustrations-v2.json`. Chỉ dùng trang trí, không gán speciesId/pack.media hoặc đưa vào nhận diện chấm điểm. Không caption AI trên UI theo yêu cầu; nguồn AI vẫn giữ trong hồ sơ nội bộ. Đã kiểm alpha thật và hiển thị trên nền sáng/tối. Bản v1 đã chuyển vào `superseded/`, không còn đóng gói runtime.

## Phát âm

`pronunciation.csv` liệt kê đầy đủ 18 mục. Hiện **0 file audio**, 6 hướng dẫn Nhật kana–romaji nháp, 12 mục Anh/khoa học còn thiếu phiên âm/hướng dẫn; **0 đã duyệt**. Hướng dẫn Nhật là chuyển đọc biên tập từ chữ Nhật đã đối chiếu, chưa khớp bản thu. Không tạo clip giả/TTS để đánh dấu hoàn thành.

## HS

Nguồn: [Cổng Thông tin Thương mại Việt Nam, phụ lục TT 01/2024/TT-BCT](https://www.vietnamtradeportal.gov.vn/index.php?id=4134&r=site/display). Đã đọc mô tả các nhánh cá đông lạnh và phi lê đông lạnh: 0303.42, 0304.87, 0303.63. Bản nguồn dùng HS 2022 cấp 6 số; không phải căn cứ xác nhận mã 8 số hay hiệu lực khai báo của mọi thị trường.

Ba hồ sơ dựng cho học nội bộ: cá ngừ vây vàng nguyên con đông lạnh; cùng loài thiếu thông tin dạng hàng; cùng loài phi lê đông lạnh. Đều chưa duyệt nghiệp vụ. 0304.87 là mã nhóm gồm nhiều loài, không gọi là mã riêng Thunnus albacares. Không dùng số liệu về thuế, quy tắc xuất xứ CC hay suy luận miễn thuế làm nội dung bài chấm mã.

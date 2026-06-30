# Admin Menu Drag Sort Design

## Goal

Cho phép Admin web sắp xếp thứ tự danh mục và món ăn bằng kéo thả, lưu vào `sort_order` để Mini App và Admin hiển thị đúng thứ tự vận hành.

## Scope

- Kéo thả danh mục trong sidebar trang `Admin > Menu`.
- Kéo thả món trong danh mục đang chọn.
- Sau khi thả, cập nhật thứ tự ngay trên UI và lưu xuống Supabase.
- Server action phải xác thực user hiện tại và chỉ cập nhật bản ghi thuộc `store_id` của user.
- Không kéo món xuyên danh mục trong phiên bản này; đổi danh mục vẫn qua form sửa món hiện có.

## Approach

Admin web dùng `@dnd-kit/core` và `@dnd-kit/sortable` vì nhẹ, hỗ trợ pointer/keyboard, phù hợp React 19 và không cần viết drag logic thủ công. Client giữ local state từ `categories`, reorder optimistic khi thả, gọi server action lưu thứ tự, rồi `router.refresh()`.

Server actions mới:

- `reorderCategories(categoryIds: string[])`
- `reorderMenuItems(categoryId: string, itemIds: string[])`

Cả hai action chuẩn hóa danh sách ID, kiểm tra tất cả ID thuộc đúng store, rồi cập nhật `sort_order` theo index mới.

## Testing

- Thêm helper thuần để tính payload reorder và lọc ID trùng/rỗng.
- Viết Vitest cho helper trước khi triển khai.
- Chạy `npm run test`, `npm run lint`, `npm run build` trong `admin-web`.

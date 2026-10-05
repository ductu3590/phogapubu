# Mini App Stitch — MA-2 (Đơn gọi m07 + chuyển thẳng sau khi gọi món + Trạng thái đơn + Thông tin nhà hàng) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quán trả sau gọi món xong thì sang thẳng tab **Đơn gọi**; trang Đơn gọi làm lại theo Stitch m07 với nhãn trạng thái đúng mô hình quán (Bảo Lương không có màn bếp); trang Trạng thái đơn (chỉ còn dùng cho trả trước/mang về) và Thông tin nhà hàng theo ngôn ngữ mới.

**Architecture:** Quyết định trạng thái → nhãn là hàm thuần `roundStatus()` đọc `payment_timing` + `kitchen_release_policy` (không gắn tên quán). Dữ liệu trả sau lấy từ `get_table_session_bill` (đã có món từng lượt). Thêm `kitchenReleasePolicy` vào `PublicWorkflow` (RPC `get_public_store_workflow` đã trả field này). Không đổi DB.

**Tech Stack:** như MA-1 (React 18 + TS, Tailwind token `src/tokens.js`, zmp-ui `useSnackbar`, vitest node-only).

**Spec:** `docs/superpowers/specs/2026-10-05-mini-app-stitch-design.md` (§4 MA-2) + quyết định trong hội thoại 2026-10-05: *"Khi khách ấn đặt đơn từ mã QR thì hiển thị luôn sang trang Đơn gọi … có thêm CTA gọi thêm món … bỏ qua cái màn kia"*.

## Global Constraints

- Như MA-1 (tiếng Việt, mobile-first 360/390, màu chủ đạo cho điểm nhấn, nhãn trạng thái theo ý nghĩa + luôn có chữ, không thêm dependency, không đổi logic tạo đơn/thanh toán).
- Không gắn cứng slug quán; phân nhánh theo `paymentTiming` (`prepay`/`postpay`) và `kitchenReleasePolicy` (`automatic`/`pos_confirmation`).
- Chỉ kiểm trên Bảo Lương; code trả trước/mang về (Pubu) phải giữ đúng hành vi cũ.
- Mục tiêu trình duyệt cũ (Android 5): không dùng `Array.prototype.flatMap`/`at`.

## Giới hạn dữ liệu đã biết (không sửa DB trong MA-2)

- `get_table_session_bill` **bỏ đơn `cancelled`** và món `void_type='cancelled'` → lượt bị thu ngân từ chối **biến khỏi danh sách**, không có nhãn "Bị từ chối". Món tặng có (`void_type='gift'`, giá 0).
- Phiên đóng (đã thanh toán) → bill `found:false` → bàn về trạng thái "chưa gọi món"; nhãn "Đã thanh toán" của trả sau trên thực tế không hiện.

## Review Focus

1. **Gọi món ở quán trả sau nhưng mạng chậm, bill chưa kịp có đơn mới** → sang Đơn gọi vẫn thấy lượt mới (trang đang realtime + invalidate) chứ không trống; nếu bill chưa có, hiện khung chờ chứ không "Chưa gọi món nào". Kiểm bằng ảnh Task 6.
2. **Quán trả trước (Pubu) gọi món tiền mặt / ZaloPay** → vẫn vào màn Trạng thái đơn như cũ (không bị đổi luồng). Test `afterOrderRoute` Task 2.
3. **Lượt do nhân viên / POS / đặt trước thêm vào bàn** → hiện đúng, có nhãn nguồn ("Nhân viên gọi hộ", "Quán thêm", "Món đặt trước"), không bị tính là "Chờ xác nhận" khi đã xác nhận. Test `roundStatus` + `roundSourceLabel` Task 1.
4. **Món tặng** → dòng hiện "Đã tặng · 0đ", tổng không cộng. Test Task 1 (`lineLabel`).
5. **Nút Quay lại sau khi gửi món** → không đưa khách về giỏ đã gửi (dùng `replace`). Kiểm ảnh Task 6.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `mini-app/src/types/workflow.types.ts`, `mini-app/src/services/workflow/workflow.api.ts` (+test) | Thêm `kitchenReleasePolicy` vào `PublicWorkflow` |
| `mini-app/src/utils/round-status.ts` (+test) | `roundStatus`, `roundSourceLabel`, `lineLabel`, `hasPendingRound` |
| `mini-app/src/utils/after-order-route.ts` (+test) | Gọi món xong đi đâu |
| `mini-app/src/pages/checkout/index.tsx` | Dùng `afterOrderRoute` |
| `mini-app/src/pages/session-orders/index.tsx` | Đơn gọi m07 (dine-in), làm gọn takeaway view |
| `mini-app/src/components/ui/tab-bar.tsx`, `components/layout/layout.tsx`, `router.tsx` | Chấm báo tab Đơn gọi; `/session-orders` dùng thanh công cụ chung |
| `mini-app/src/pages/order-status/index.tsx` | Ngôn ngữ mới (trả trước/mang về) |
| `mini-app/src/pages/store-info/index.tsx` | Ngôn ngữ mới |
| `docs/testing/mini-app-stitch/MA-2.md`, `TESTING.md` | Checklist |

---

### Task 1: Hàm thuần trạng thái lượt gọi + workflow có `kitchenReleasePolicy`

**Files:** Create `mini-app/src/utils/round-status.ts`, `round-status.test.ts`; Modify `types/workflow.types.ts`, `services/workflow/workflow.api.ts`, `services/workflow/workflow.api.test.ts`.

**Interfaces — Produces:**
- `PublicWorkflow.kitchenReleasePolicy: "automatic" | "pos_confirmation"` (thiếu/lạ → `"automatic"`).
- `type RoundTone = "warning" | "info" | "success" | "critical" | "neutral"`
- `roundStatus(status: OrderState, ctx: { paymentTiming: "prepay" | "postpay"; kitchenPolicy: "automatic" | "pos_confirmation" }): { label: string; tone: RoundTone }`
  - postpay + pos_confirmation: `pending`→"Chờ xác nhận"/warning; `confirmed|cooking|ready`→"Đã vào bếp"/info; `paid`→"Đã thanh toán"/success; `cancelled`→"Bị từ chối"/critical.
  - postpay + automatic: `pending`→"Đã gửi bếp"/info (đơn tiền mặt vào bếp ngay); `confirmed`→"Đã vào bếp"/info; `cooking`→"Đang làm"/info; `ready`→"Món xong"/success; `paid`→"Đã thanh toán"/success; `cancelled`→"Đã huỷ"/critical.
  - prepay: `pending`→"Chờ thanh toán"/warning; `confirmed`→"Đã vào bếp"/info; `cooking`→"Đang làm"/info; `ready`→"Món xong"/success; `paid`→"Hoàn tất"/success; `cancelled`→"Đã huỷ"/critical.
- `roundSourceLabel(source: string): string | null` — `staff`→"Nhân viên gọi hộ", `pos`→"Quán thêm", `reservation_preorder`→"Món đặt trước", khác→`null`.
- `lineLabel(item: { quantity: number; price: number; void_type?: string | null }): { gift: boolean; amount: number }` — gift → `{gift:true, amount:0}`; còn lại `price*quantity`.
- `hasPendingRound(orders: Array<{ status: OrderState }>, ctx): boolean` — có lượt nhãn "Chờ xác nhận".

- [ ] **Step 1: Test thất bại** `round-status.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hasPendingRound, lineLabel, roundSourceLabel, roundStatus } from "./round-status";

const BL = { paymentTiming: "postpay", kitchenPolicy: "pos_confirmation" } as const;
const PUBU = { paymentTiming: "prepay", kitchenPolicy: "automatic" } as const;

describe("roundStatus — quán thu ngân duyệt + in phiếu (Bảo Lương)", () => {
  it("chờ thu ngân → Chờ xác nhận (vàng)", () => expect(roundStatus("pending", BL)).toEqual({ label: "Chờ xác nhận", tone: "warning" }));
  it("đã xác nhận / đang nấu / xong đều là Đã vào bếp — không bao giờ hiện bước bếp giả", () => {
    for (const s of ["confirmed", "cooking", "ready"] as const) expect(roundStatus(s, BL)).toEqual({ label: "Đã vào bếp", tone: "info" });
  });
  it("đã thu tiền → Đã thanh toán; huỷ → Bị từ chối", () => {
    expect(roundStatus("paid", BL)).toEqual({ label: "Đã thanh toán", tone: "success" });
    expect(roundStatus("cancelled", BL)).toEqual({ label: "Bị từ chối", tone: "critical" });
  });
});

describe("roundStatus — quán trả trước có màn bếp (Pubu)", () => {
  it("pending là chờ thanh toán, đủ các bước bếp", () => {
    expect(roundStatus("pending", PUBU).label).toBe("Chờ thanh toán");
    expect(roundStatus("cooking", PUBU).label).toBe("Đang làm");
    expect(roundStatus("ready", PUBU)).toEqual({ label: "Món xong", tone: "success" });
    expect(roundStatus("paid", PUBU).label).toBe("Hoàn tất");
  });
});

describe("phụ trợ", () => {
  it("nhãn nguồn lượt gọi", () => {
    expect(roundSourceLabel("staff")).toBe("Nhân viên gọi hộ");
    expect(roundSourceLabel("pos")).toBe("Quán thêm");
    expect(roundSourceLabel("reservation_preorder")).toBe("Món đặt trước");
    expect(roundSourceLabel("customer_zalo")).toBeNull();
  });
  it("món tặng → 0đ", () => {
    expect(lineLabel({ quantity: 2, price: 50000, void_type: "gift" })).toEqual({ gift: true, amount: 0 });
    expect(lineLabel({ quantity: 2, price: 50000, void_type: null })).toEqual({ gift: false, amount: 100000 });
  });
  it("còn lượt chờ xác nhận", () => {
    expect(hasPendingRound([{ status: "confirmed" }, { status: "pending" }], BL)).toBe(true);
    expect(hasPendingRound([{ status: "confirmed" }], BL)).toBe(false);
    expect(hasPendingRound([], BL)).toBe(false);
  });
});
```
- [ ] **Step 2:** `npx vitest run src/utils/round-status.test.ts` → FAIL (module thiếu).
- [ ] **Step 3: Code** `round-status.ts` theo bảng Interfaces (map tĩnh theo nhánh; status lạ → nhãn của `pending` nhánh đó).
- [ ] **Step 4: Workflow** — trong `workflow.api.ts` nơi map RPC → `PublicWorkflow`, thêm `kitchenReleasePolicy: raw.kitchen_release_policy === "pos_confirmation" ? "pos_confirmation" : "automatic"`; type thêm field. Test trong `workflow.api.test.ts`: payload có `kitchen_release_policy: "pos_confirmation"` → field đúng; thiếu → `"automatic"`.
- [ ] **Step 5:** chạy cả suite → PASS; typecheck ≤ 4 lỗi mốc. Commit `feat: ham trang thai luot goi theo mo hinh quan`.

### Task 2: Gọi món xong sang thẳng Đơn gọi (trả sau tại bàn)

**Files:** Create `mini-app/src/utils/after-order-route.ts` (+test); Modify `pages/checkout/index.tsx:340-345`.

**Interfaces — Produces:** `afterOrderRoute(input: { isPostpayDineIn: boolean; orderId: string }): { path: string; replace: boolean; toast: string | null }` — postpay dine-in → `{ path: "/session-orders", replace: true, toast: "Đã gửi món, chờ thu ngân xác nhận" }`; còn lại → `{ path: "/order-status/<id>", replace: false, toast: null }`.

- [ ] **Step 1: Test** `after-order-route.test.ts`: 2 nhánh như trên (Review Focus #2).
- [ ] **Step 2:** chạy → FAIL. **Step 3:** code. **Step 4:** PASS.
- [ ] **Step 5:** checkout nhánh tiền mặt (`else` ở dòng ~340): `const next = afterOrderRoute({ isPostpayDineIn, orderId: order.id }); clearCart(); setIsProcessing(false); if (next.toast) openSnackbar({ text: next.toast, type: "success" }); navigate(next.path, { replace: next.replace });`. Câu toast cho quán `automatic` trả sau: hàm nhận thêm `kitchenPolicy` → `"Đã gửi món cho bếp"` khi `automatic` (thêm vào test).
- [ ] **Step 6:** typecheck + suite. Commit `feat: goi mon xong sang thang Don goi (tra sau)`.

### Task 3: Trang Đơn gọi theo m07

**Files:** Modify `pages/session-orders/index.tsx`, `router.tsx` (`/session-orders` bỏ `hideHeader`, thêm `title: "Đơn gọi"`).

- [ ] **Step 1: Router** — `/session-orders` handle `{ title: "Đơn gọi" }` (giữ tab, giữ giỏ ẩn: `hideCart: true` vì trang có nút riêng).
- [ ] **Step 2: Dine-in view** (giữ toàn bộ hook/realtime/định danh PB5):
  - Bỏ `Header` riêng và nút "Gọi nhân viên" trong trang (thanh công cụ đã có Gọi NV).
  - **Thẻ đầu** (`SectionCard`): tên bàn/mâm (`sessionState.table_names` nếu mâm, không thì `tableNumber`), "Giờ vào HH:MM" (`bill.opened_at`), chấm xanh "Đang phục vụ"; **Tổng tạm tính** chữ lớn màu chủ đạo (`bill.total`).
  - **"Các lượt gọi món (N lượt)" · "Mới nhất ở trên"** — mỗi lượt một thẻ có vạch trái theo tone (`border-l-4`), "Lượt #NN" + giờ, `StatusPill` từ `roundStatus`, nhãn nguồn nếu có; danh sách món luôn mở (bill đã có items): tên (kèm loại/topping), `×n`, tiền; món tặng → "Đã tặng · 0đ"; tiểu kế lượt.
  - Trả trước (không có bill): giữ nguồn `useSessionOrders` + mở rộng món lazy như cũ nhưng trình bày cùng thẻ.
  - **Khối "Đối soát tạm tính"**: "Đã vào bếp (lượt …)" tổng các lượt không chờ, "Đang chờ xác nhận" tổng lượt chờ, kẻ ngang, "Tổng cộng tạm tính". Trả sau thêm dòng ⓘ "Quý khách thanh toán tại quầy thu ngân khi kết thúc bữa".
  - **`StickyActionBar` một nút "Gọi thêm món"** → `navigate("/")`.
  - Trống: thẻ giữa trang "Bàn chưa gọi món nào" + nút "Xem thực đơn". Đang tải (kể cả vừa gửi món — Review Focus #1): khung chờ 2 thẻ.
- [ ] **Step 3: Takeaway view**: bỏ `Header` riêng (đã có thanh công cụ), thẻ dùng `SectionCard` + `StatusPill` (map `getTakeawayStatus` cls → tone); logic "Đã nhận" giữ nguyên.
- [ ] **Step 4:** typecheck + suite. Commit `feat: trang Don goi theo Stitch m07`.

### Task 4: Chấm báo tab Đơn gọi

**Files:** Modify `components/ui/tab-bar.tsx` (prop `badges?: Partial<Record<TabKey, boolean>>` → chấm đỏ góc icon), `components/layout/layout.tsx`.

- [ ] Layout: khi `entryContext.kind === "table"` và `paymentTiming === "postpay"`, dùng `useTableSessionBill(tableId, zaloUserId, deviceId, true)` (cùng queryKey với trang → không gọi trùng) → `badges.session = hasPendingRound(bill.orders, ctx)`. Trả trước: không chấm.
- [ ] typecheck + suite. Commit `feat: cham bao tab Don goi khi con luot cho xac nhan`.

### Task 5: Trạng thái đơn + Thông tin nhà hàng theo ngôn ngữ mới

**Files:** Modify `pages/order-status/index.tsx`, `pages/store-info/index.tsx`.

- [ ] **Trạng thái đơn** (giờ chỉ trả trước/mang về đi vào): khối trạng thái đầu trang dùng tone theo `roundStatus` (nhánh prepay); thanh 4 bước giữ cho quán `automatic`; nếu `kitchenPolicy === "pos_confirmation"` (vào bằng link cũ) → 3 bước "Đã gửi đơn · Đã vào bếp · Đã thanh toán". Các khối chi tiết/nút dùng `SectionCard`, nút "Gọi thêm món" thành `StickyActionBar`. Logic realtime/xác nhận nhận hàng/vòng quay giữ nguyên.
- [ ] **Thông tin nhà hàng**: `SectionCard` cho thẻ quán (logo/chữ viết tắt + tên + giới thiệu), khối liên hệ (địa chỉ, điện thoại bấm gọi, wifi + nút sao chép), khối Zalo OA (CTA quan tâm dùng `useOaFollow`), điều khoản. Giữ nguyên `PermissionSheet`, sessionStorage sheet, sao chép wifi.
- [ ] typecheck + suite. Commit `feat: trang Trang thai don + Thong tin nha hang theo Stitch`.

### Task 6: Ảnh chụp + checklist

- [ ] Merge nhánh vào `mini-app-instances/bia-lau-bao-luong`, `npm run dev` đang chạy.
- [ ] Chụp 360/390 (không ghi DB thật): trang Đơn gọi với bill giả qua `page.route` chặn RPC `get_table_session_bill` (3 lượt: 1 `pending` khách gọi, 1 `confirmed` nhân viên gọi hộ có món tặng, 1 `confirmed` POS thêm); trạng thái trống; tab có chấm; trang Thông tin nhà hàng; Trạng thái đơn (giả 1 đơn prepay `cooking`). Kiểm không cuộn ngang, thanh "Gọi thêm món" không đè tab.
- [ ] Viết `docs/testing/mini-app-stitch/MA-2.md` (đã làm · giới hạn dữ liệu đã biết · bài test) + mục lục `TESTING.md` "chờ test". Commit. **DỪNG** chờ `MA-2 PASS`.

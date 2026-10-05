import { useSnackbar } from "zmp-ui";
import { BellIcon } from "@/components/common/icons";
import { useCallStaff } from "@/services/order/order.mutations";
import { callStaffMessage } from "@/utils/call-staff-message";

// Một loại yêu cầu duy nhất (spec Q5). Chặn 3 phút là việc của SERVER (mig 087);
// client chỉ khoá nút trong lúc đang gửi và hiện đúng câu server trả.
export default function CallStaffButton({ tableId }: { tableId: string }) {
  const { mutate, isPending } = useCallStaff();
  const { openSnackbar } = useSnackbar();
  const call = () =>
    mutate({ tableId }, {
      onSuccess: () => openSnackbar(callStaffMessage({ ok: true })),
      onError: (error) => openSnackbar(callStaffMessage({ ok: false, error })),
    });
  return (
    <button
      type="button"
      onClick={call}
      disabled={isPending}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-critical px-3.5 text-small-m font-bold text-white shadow-sm active:opacity-80 disabled:opacity-60"
    >
      <BellIcon className="mevo-bell size-4" />
      {isPending ? "Đang gọi…" : "Gọi NV"}
    </button>
  );
}

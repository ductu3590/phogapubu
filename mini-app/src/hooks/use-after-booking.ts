import { useNavigate } from "react-router-dom";
import { useSnackbar } from "zmp-ui";

// Đặt bàn xong → quay về TAB "Đặt bàn" (/reservations), không sang trang chi tiết (anh Tú 2026-10-05):
// lịch hẹn vừa đặt hiện ngay đầu trang. replace để nút Quay lại không về form đã gửi.
export function useAfterBooking() {
  const navigate = useNavigate();
  const { openSnackbar } = useSnackbar();
  return () => {
    openSnackbar({ text: "Đã gửi yêu cầu đặt bàn. Quán sẽ xác nhận sớm.", type: "success" });
    navigate("/reservations", { replace: true });
  };
}

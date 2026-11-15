import type { ReactNode } from "react";
import { Sheet } from "zmp-ui";

// Bảng trượt của ZaUI (theme classic). Nằm ở file riêng để bottom-sheet.tsx nạp trễ:
// Sheet kéo theo react-spring + use-gesture, không cần cho lần vẽ đầu.
export default function ClassicSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Sheet autoHeight visible={visible} onClose={onClose}>
      {children}
    </Sheet>
  );
}

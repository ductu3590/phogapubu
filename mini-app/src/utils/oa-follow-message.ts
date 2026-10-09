// Kết quả bấm nút tim (quan tâm OA). Trước 2026-10-09 nút tim bị KHOÁ khi đã quan tâm và nuốt mọi lỗi
// followOA → khách bấm "không có tác dụng gì". Giờ lần bấm nào cũng có phản hồi.
export type OaFollowOutcome =
  | { kind: "already" }
  | { kind: "followed" }
  | { kind: "denied" }
  | { kind: "error"; code?: number | string };

export function oaFollowMessage(outcome: OaFollowOutcome, storeName: string): string | null {
  const name = storeName.trim() || "quán";
  switch (outcome.kind) {
    case "already":
      return `Bạn đã quan tâm ${name} trên Zalo`;
    case "followed":
      return `Đã quan tâm ${name} trên Zalo`;
    case "denied":
      return null;
    case "error":
      return `Chưa quan tâm được quán (mã ${outcome.code ?? "?"}). Thử lại sau.`;
  }
}

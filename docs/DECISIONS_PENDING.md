# Quyết định đang chờ anh duyệt

Agent ghi vào đây khi chạm cổng cứng hoặc gặp điều thuộc "Quyết định dành cho người" trong PROJECT.md. Anh trả lời ngay dưới mục, hoặc chạy `python scripts/approve.py <gate> <giờ>`. Orchestrator đọc lại file này mỗi vòng.

Mẫu:
```
## D-001 · 2026-11-09 · gate: auth · task: T-004 · trạng thái: chờ
- Cần làm: thêm Google login vào middleware
- Vì sao: tiêu chí chấp nhận của T-004
- Phương án đề xuất: ... (khuyến nghị)  /  Phương án khác: ...
- Rủi ro nếu duyệt: ...
- Trả lời của anh:
```

---

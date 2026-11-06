# Tạo máy in ảo "MEVO PDF" xuất thẳng ra file (không hộp thoại Lưu), để thử in ngầm.
# Cần chạy PowerShell QUYỀN ADMIN. Máy in "Microsoft Print to PDF" gốc luôn mở hộp thoại Lưu
# nên không in ngầm được. Không có quyền admin thì dùng máy in gốc và tự chọn chỗ lưu.
New-Item -ItemType Directory -Force C:\mevo-print-test | Out-Null
Add-PrinterPort -Name 'C:\mevo-print-test\out.pdf'
Add-Printer -Name 'MEVO PDF' -DriverName 'Microsoft Print To PDF' -PortName 'C:\mevo-print-test\out.pdf'

@echo off
REM ==========================================================================
REM  MEVO - Cai may quay (POS) cho Bia lau Bao Luong
REM  Chay 1 lan tren MAY QUAY. Tao loi tat "MEVO POS - Bao Luong" tren Desktop,
REM  mo POS dang cua so rieng, IN THANG khong hoi hop thoai, tu mo khi bat may.
REM
REM  TRUOC KHI CHAY: sua dong POS_URL ben duoi thanh link quan ly that,
REM  va dat may in bill lam MAY IN MAC DINH cua Windows.
REM ==========================================================================
setlocal

set "POS_URL=https://mevo.vn/admin/pos"
set "SHORTCUT_NAME=MEVO POS - Bao Luong"

if /I "%POS_URL:CHANGE-ME=%" NEQ "%POS_URL%" (
  echo [LOI] Chua sua POS_URL. Mo file nay bang Notepad, thay link that roi chay lai.
  pause & exit /b 1
)

REM --- Tim trinh duyet: uu tien Chrome, khong co thi Edge ---
set "BROWSER="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do (
  if not defined BROWSER if exist %%P set "BROWSER=%%~P"
)
if not defined BROWSER (
  echo [LOI] Khong thay Chrome hoac Edge. Cai Chrome roi chay lai.
  pause & exit /b 1
)
echo Trinh duyet: %BROWSER%

REM --- Ho so rieng cho POS (tach khoi trinh duyet ca nhan) ---
set "PROFILE=C:\MEVO-POS-Profile"

REM --- Lenh mo POS: cua so rieng (--app), in thang (--kiosk-printing) ---
REM  Muon che do kiosk toan man hinh thi doi --app="%POS_URL%" thanh:  --kiosk "%POS_URL%"
set "ARGS=--app=%POS_URL% --kiosk-printing --user-data-dir=%PROFILE% --autoplay-policy=no-user-gesture-required"

if not defined OUT_DIRS set "OUT_DIRS=[Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup')"
REM --- Tao shortcut tren Desktop va trong Startup bang PowerShell ---
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "foreach ($dir in @(%OUT_DIRS%)) {" ^
  "  $s = $ws.CreateShortcut((Join-Path $dir '%SHORTCUT_NAME%.lnk'));" ^
  "  $s.TargetPath = '%BROWSER%';" ^
  "  $s.Arguments = '%ARGS%';" ^
  "  $s.WorkingDirectory = Split-Path '%BROWSER%';" ^
  "  $s.IconLocation = '%BROWSER%,0';" ^
  "  $s.Save() }"

if errorlevel 1 (
  echo [LOI] Khong tao duoc shortcut.
  pause & exit /b 1
)

echo.
echo ==== XONG ====
echo - Da tao "%SHORTCUT_NAME%" tren Desktop va trong Startup (tu mo khi bat may).
echo - Mo no, dang nhap bang TAI KHOAN THU NGAN, tich nho dang nhap.
echo - Dat may in bill lam MAY IN MAC DINH de in thang dung may.
echo - Bam vao trang 1 lan de bat tieng chuong.
echo.
pause
endlocal

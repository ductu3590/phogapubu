; Tự chạy cùng Windows: ghi ngay lúc cài, không đợi lần mở đầu tiên của phần mềm.
; Tên giá trị và đường dẫn PHẢI khớp setLoginItemSettings trong src/main.ts (LOGIN_ITEM_NAME),
; lệch nhau là Windows có hai dòng khởi động cho cùng một phần mềm.
!define MEVO_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define MEVO_RUN_NAME "MEVO In"

!macro customInstall
  WriteRegStr HKCU "${MEVO_RUN_KEY}" "${MEVO_RUN_NAME}" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
!macroend

!macro customUnInstall
  ; Cài đè bản mới cũng chạy trình gỡ của bản cũ: khi đó giữ nguyên dòng khởi động
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "${MEVO_RUN_KEY}" "${MEVO_RUN_NAME}"
  ${endIf}
!macroend

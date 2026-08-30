; Uninstalling offers to take the settings with it. electron-builder's own
; deleteAppDataOnUninstall is no use here: it removes %APPDATA%\<productName> and
; %APPDATA%\<package name>, and this app pins userData to pubooru-desktop (see
; src/main/index.ts) so the name on the window can change without moving the save
; file. Neither folder it deletes is the one that exists.
;
; Asking is the point. save.json holds the service-role key and the remembered
; login in plain text, so leaving it behind on an uninstall is a decision the
; person uninstalling should get to make either way.

!macro customUnInstall
  ; Not on an upgrade — electron-builder uninstalls the old version in place, and
  ; a prompt there would be a config-wiping dialog in the middle of an install.
  ; Not when silent either: an unattended run answers IDNO and keeps the data.
  ${ifNot} ${isUpdated}
  ${AndIfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Also delete Pubooru's settings?$\r$\n$\r$\nThis removes save.json, including the saved Supabase keys and login." \
      /SD IDNO IDNO skipAppData
    ; Electron always writes userData under the per-user AppData, whatever mode
    ; the installer itself ran in.
    SetShellVarContext current
    RMDir /r "$APPDATA\pubooru-desktop"
    skipAppData:
  ${endIf}
!macroend

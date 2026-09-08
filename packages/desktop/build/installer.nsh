; Where the app should appear, asked rather than decided. It was decided for a while —
; Start menu yes, desktop no — and the reasoning held for one machine and not for the
; person who wanted the icon. A checkbox costs a page nobody has to read: the defaults
; are the old decision, so Next twice installs exactly what 2.6.2 installed.
;
; It has to be done by deletion. electron-builder's createStartMenuShortcut /
; createDesktopShortcut are compile-time !defines — they decide what the installer *can*
; do, not what this run does — so both are on, the install section makes both links, and
; this takes back the one that was not asked for. Both being on is also what makes the
; uninstaller clean them up: its Delete lines sit behind the same defines.

!macro customPageAfterChangeDir
  ; nsDialogs is already in the build via MUI2 and its own include guard makes this free;
  ; naming it is how this file stays readable on its own.
  !include "nsDialogs.nsh"

  Var /GLOBAL wantStartMenu
  Var /GLOBAL wantDesktop
  Var /GLOBAL cbStartMenu
  Var /GLOBAL cbDesktop

  Page custom shortcutsPageCreate shortcutsPageLeave

  Function shortcutsPageCreate
    ; An upgrade keeps whatever shortcuts the last install left, which is what the
    ; keepShortcuts machinery in the install section is for. Asking again would be a
    ; question with a wrong default: the answer is already on disk.
    ${if} ${isUpdated}
      Abort
    ${endif}

    !insertmacro MUI_HEADER_TEXT "Shortcuts" "Choose where Pubooru should appear."

    nsDialogs::Create 1018
    Pop $0
    ${if} $0 == error
      Abort
    ${endif}

    ${NSD_CreateCheckbox} 0 8u 100% 12u "Add a Start menu entry"
    Pop $cbStartMenu
    ${if} $wantStartMenu == 1
      ${NSD_Check} $cbStartMenu
    ${endif}

    ${NSD_CreateCheckbox} 0 26u 100% 12u "Add a desktop shortcut"
    Pop $cbDesktop
    ${if} $wantDesktop == 1
      ${NSD_Check} $cbDesktop
    ${endif}

    nsDialogs::Show
  FunctionEnd

  Function shortcutsPageLeave
    ${NSD_GetState} $cbStartMenu $wantStartMenu
    ${NSD_GetState} $cbDesktop $wantDesktop
  FunctionEnd
!macroend

; The page never runs on a silent install, so the defaults are also the answer an
; unattended run gives — and they are the old behaviour, Start menu and nothing else.
!macro customInit
  StrCpy $wantStartMenu 1
  StrCpy $wantDesktop 0
!macroend

!macro customInstall
  ${ifNot} ${isUpdated}
    ${if} $wantStartMenu != 1
      WinShell::UninstShortcut "$newStartMenuLink"
      Delete "$newStartMenuLink"
      ; Only removes it if it is empty, so a menu folder shared with anything else stays.
      !ifdef MENU_FILENAME
        RMDir "$SMPROGRAMS\${MENU_FILENAME}"
      !endif
      ; The install section points the finish page's Run button at the Start menu link
      ; when it finds one, and it found the one just deleted. Aim it at the exe instead,
      ; or ticking Run Pubooru does nothing at all.
      StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${endIf}

    ${if} $wantDesktop != 1
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
      ; Explorer caches the desktop; without this the icon lingers until a refresh.
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endIf}
  ${endIf}
!macroend

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
      "Also delete Pubooru's settings?$\r$\n$\r$\nThis removes save.json, including your compression settings and tag catalogs." \
      /SD IDNO IDNO skipAppData
    ; Electron always writes userData under the per-user AppData, whatever mode
    ; the installer itself ran in.
    SetShellVarContext current
    RMDir /r "$APPDATA\pubooru-desktop"
    skipAppData:
  ${endIf}
!macroend

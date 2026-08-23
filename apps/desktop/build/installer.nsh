; Remove the exact LocalAppData folder used by the desktop runtime on uninstall.
!macro customUnInstall
  RMDir /r "$LOCALAPPDATA\\Lemyloi-dichvideo"
!macroend

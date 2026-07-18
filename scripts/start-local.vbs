' Musteri Bulma - lokal sunucuyu ve worker'i arka planda baslatip
' tarayicida http://localhost:3000 acar. Hicbir terminal penceresi gostermez.

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

projectDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
WshShell.CurrentDirectory = projectDir

' Sunucu ve worker'i gizli pencerede baslat (0 = gizli, False = bekleme)
WshShell.Run "cmd /c npm run dev", 0, False
WshShell.Run "cmd /c npm run worker:dev", 0, False

' Sunucunun ayaga kalkmasi icin kisa bir bekleme
WScript.Sleep 4000

WshShell.Run "http://localhost:3000", 1, False

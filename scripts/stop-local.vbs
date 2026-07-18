' Musteri Bulma - server.ts / pipeline.worker.ts'i calistiran node.exe
' process'lerini (ve onlari baslatan npm parent'larini) durdurur.
' Turkce karakterli klasor yolu WMI CommandLine'da bozuk gorunebildigi icin
' eslestirme dosya adlarina (server.ts / pipeline.worker.ts) gore yapilir.

Set WshShell = CreateObject("WScript.Shell")

psCommand = "$t = Get-CimInstance Win32_Process -Filter 'Name=''node.exe''' | " & _
  "Where-Object { $_.CommandLine -match 'server\.ts|pipeline\.worker\.ts' }; " & _
  "$ids = @(); foreach ($p in $t) { $ids += $p.ProcessId; $ids += $p.ParentProcessId }; " & _
  "$ids | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

WshShell.Run "powershell -NoProfile -WindowStyle Hidden -Command " & Chr(34) & psCommand & Chr(34), 0, True

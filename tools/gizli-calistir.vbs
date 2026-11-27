' Zamanlanmis gorevler icin: Node betigini pencere acmadan calistirir.
' Kullanim: wscript.exe tools\gizli-calistir.vbs C:\...\tools\site-izle.mjs
' Cikti: %LOCALAPPDATA%\okutan-<betik>.log (son calisma eklenir)
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
betik = WScript.Arguments(0)
logf = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\okutan-" & fso.GetBaseName(betik) & ".log"
sh.Run "cmd /c """"C:\Program Files\nodejs\node.exe"" """ & betik & """ >> """ & logf & """ 2>&1""", 0, False

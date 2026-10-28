Option Explicit

Dim shell, appFolder, pythonPath, attempt
Set shell = CreateObject("WScript.Shell")

appFolder = "C:\Users\Breno\Desktop\Projects\PROJETO LIFESTYLE"
pythonPath = "C:\Users\Breno\AppData\Local\Python\pythoncore-3.14-64\python.exe"
shell.CurrentDirectory = appFolder

If Not CreateObject("Scripting.FileSystemObject").FileExists(pythonPath) Then
  MsgBox "O Python não foi encontrado neste computador. Entre em contato com quem configurou o Casa em Dia.", vbExclamation, "Casa em Dia"
  WScript.Quit 1
End If

If Not ServerResponds() Then
  shell.Run """" & pythonPath & """ """ & appFolder & "\server.py"" --host 0.0.0.0 --port 8765", 0, False
  For attempt = 1 To 30
    WScript.Sleep 500
    If ServerResponds() Then Exit For
  Next
  If Not ServerResponds() Then
    MsgBox "Nao consegui iniciar o dashboard. Verifique se a porta 8765 esta livre e tente novamente.", vbCritical, "Casa em Dia"
    WScript.Quit 1
  End If
End If

shell.Run "http://127.0.0.1:8765/", 1, False

Function ServerResponds()
  Dim request
  On Error Resume Next
  Err.Clear
  Set request = CreateObject("WinHttp.WinHttpRequest.5.1")
  request.SetTimeouts 500, 500, 500, 500
  request.Open "GET", "http://127.0.0.1:8765/", False
  request.Send
  If Err.Number = 0 Then
    ServerResponds = (request.Status = 200)
  Else
    ServerResponds = False
  End If
  Err.Clear
  On Error GoTo 0
End Function

Option Explicit

' Abre o Casa em Dia somente neste computador (http://127.0.0.1:8765).
' Para usar em outros aparelhos da casa, inicie manualmente em rede privada confiavel:
'   python server.py --host 0.0.0.0 --port 8765

Dim shell, fso, appFolder, pythonCommand, attempt
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

appFolder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = appFolder

pythonCommand = FindPython()
If pythonCommand = "" Then
  MsgBox "O Python nao foi encontrado neste computador. Instale o Python 3.9 ou superior em python.org e tente novamente.", vbExclamation, "Casa em Dia"
  WScript.Quit 1
End If

If Not ServerResponds() Then
  shell.Run pythonCommand & " """ & appFolder & "\server.py"" --port 8765", 0, False
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

Function FindPython()
  Dim candidate
  FindPython = ""
  For Each candidate In Array("python", "py")
    If shell.Run("cmd /c " & candidate & " --version", 0, True) = 0 Then
      FindPython = candidate
      Exit Function
    End If
  Next
End Function

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

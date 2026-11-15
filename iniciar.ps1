$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.\.venv\Scripts\python.exe')) { throw 'Crie o ambiente Python conforme o README.md.' }
if (-not (Test-Path -LiteralPath '.\dist\index.html')) { throw 'Compile o frontend com npm run build.' }
Write-Host 'PyroSync Atlas: http://127.0.0.1:8787'
& .\.venv\Scripts\python.exe -m uvicorn server.app:app --host 127.0.0.1 --port 8787

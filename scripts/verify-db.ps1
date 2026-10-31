# Verifica solo integridad estructural y SHA256, no restaura nada.
$ErrorActionPreference='Stop'
function Pause-Guide { Write-Host ''; Read-Host 'Presiona ENTER para cerrar' | Out-Null }
try {
 Write-Host 'MONKYS STORE - COMPROBACION DE RESPALDO' -ForegroundColor Cyan
 $path = Read-Host 'Pega la ruta completa del archivo .backup'
 $path = $path.Trim().Trim('"')
 if (-not (Test-Path -LiteralPath $path -PathType Leaf) -or -not $path.ToLower().EndsWith('.backup')) { throw 'No encontre un archivo .backup valido.' }
 $pgRestore = Get-Command pg_restore.exe -ErrorAction SilentlyContinue
 if (-not $pgRestore) {
  $root=Join-Path $env:ProgramFiles 'PostgreSQL'
  if(Test-Path $root){
   $pgRestore=Get-ChildItem $root -Filter pg_restore.exe -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  }
 }
 if (-not $pgRestore) { throw 'No encontre pg_restore. Instala las herramientas de PostgreSQL.' }
 $tool=if($pgRestore.Source){$pgRestore.Source}else{$pgRestore.FullName}
 & $tool '--list' $path | Out-Null
 if($LASTEXITCODE -ne 0){throw 'pg_restore no puede leer el archivo.'}
 $hash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
 Write-Host 'Archivo legible con pg_restore --list.' -ForegroundColor Green
 Write-Host "Archivo: $path"; Write-Host "SHA256: $hash"
 Write-Host 'Este chequeo NO prueba que puedas restaurar los datos.' -ForegroundColor Yellow
 Write-Host 'Las fotos/archivos de Storage requieren un respaldo aparte.' -ForegroundColor Yellow
}catch {Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red}
finally {Pause-Guide}

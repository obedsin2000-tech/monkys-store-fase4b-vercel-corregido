# Monky's Store ERP · Respaldo seguro de la base de datos · Windows PowerShell 5.1+
# Requiere pg_dump y pg_restore (herramientas cliente de PostgreSQL).
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Pause-Guide { Write-Host ''; Read-Host 'Presiona ENTER para cerrar' | Out-Null }
function PgTool([string]$tool) {
 $found = Get-Command "$tool.exe" -ErrorAction SilentlyContinue
 if ($found) { return $found.Source }
 $folder = Join-Path $env:ProgramFiles 'PostgreSQL'
 if (Test-Path $folder) {
  $list = @(Get-ChildItem $folder -Directory -ErrorAction SilentlyContinue | Sort-Object { [int]($_.Name -replace '[^0-9]','') } -Descending)
  foreach ($d in $list) { $candidate = Join-Path $d.FullName "bin\$tool.exe"; if (Test-Path $candidate) {return $candidate} }
 }
 return $null
}
function Confirm-Text([string]$inputText,[string]$pattern,[string]$field) {
 if ($inputText -notmatch $pattern) { throw "Valor no valido para $field. Revisa el dato." }
 return $inputText
}
try {
 Write-Host '================================================' -ForegroundColor Cyan
 Write-Host " MONKY'S STORE - RESPALDO DE SUPABASE (FASE 4A)" -ForegroundColor Cyan
 Write-Host '================================================' -ForegroundColor Cyan
 Write-Host 'Este proceso NO modifica ni borra datos de Supabase.'
 Write-Host 'IMPORTANTE: el archivo incluye datos personales y de ventas.' -ForegroundColor Yellow
 Write-Host 'Si aun no probaste el proceso en una copia, pide ayuda antes de operar con datos reales.'
 Write-Host ''
 $pgDump = PgTool 'pg_dump'; $pgRestore = PgTool 'pg_restore'
 if (-not $pgDump -or -not $pgRestore) {
  throw 'No encuentro pg_dump.exe y pg_restore.exe. Instala PostgreSQL (Command Line Tools) segun la guia, cierra esta ventana e intenta de nuevo.'
 }
 Write-Host "pg_dump disponible: $pgDump" -ForegroundColor Green
 Write-Host ''
 Write-Host 'En Supabase pulsa Connect > Connection string > Session pooler (o Direct connection si es compatible).'
 Write-Host 'NO pegues una URL con contraseña: solo el host, puerto y usuario por separado.'
 $dbHost = Confirm-Text (Read-Host 'Host (ej. aws-0-us-east-1.pooler.supabase.com)') '^[A-Za-z0-9.-]+$' 'Host'
 $portRaw = Read-Host 'Puerto [5432]'; if ([string]::IsNullOrWhiteSpace($portRaw)) {$portRaw='5432'}
 $portNum = 0
 if (-not [int]::TryParse($portRaw,[ref]$portNum) -or $portNum -lt 1 -or $portNum -gt 65535) { throw 'Puerto invalido.' }
 $dbUser = Confirm-Text (Read-Host 'Usuario de base de datos (ej. postgres.xxxxx o postgres)') '^[A-Za-z0-9_.-]+$' 'Usuario'
 $dbName = Read-Host 'Nombre de la base de datos [postgres]'; if ([string]::IsNullOrWhiteSpace($dbName)) {$dbName='postgres'}
 $dbName = Confirm-Text $dbName '^[A-Za-z0-9_-]+$' 'Base de datos'
 $secret = Read-Host 'Contraseña DE LA BASE DE DATOS (no de tu cuenta de Supabase)' -AsSecureString
 if ($secret.Length -eq 0) { throw 'No se introdujo contraseña.' }
 $handle = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($handle) }
 finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($handle); Remove-Variable secret -ErrorAction SilentlyContinue }
 $env:PGSSLMODE='require'
 $env:PGCONNECT_TIMEOUT='20'
 $folder = Join-Path $env:USERPROFILE 'Monkys_Backups'
 New-Item -ItemType Directory -Path $folder -Force | Out-Null
 # Restringe la carpeta y sus respaldos al usuario actual, SYSTEM y administradores locales.
 # Esto reduce exposición accidental; para pérdida/robo del equipo también se requiere cifrado de disco.
 $currentUser = (& whoami).Trim()
 & icacls $folder '/inheritance:r' '/grant:r' "$($currentUser):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '/T' '/C' | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'No pude restringir los permisos de la carpeta de respaldo. No se generó la copia.' }
 $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
 $target = Join-Path $folder ("monkys_${stamp}.backup")
 $backupFileValidated = $false
 $manifest = Join-Path $folder ("monkys_${stamp}_VERIFICACION.txt")
 # Sin contraseña en los argumentos, nombres de archivos o registro.
 $connection = "host=$dbHost port=$portNum dbname=$dbName user=$dbUser sslmode=require connect_timeout=20"
 Write-Host 'Creando copia de seguridad...' -ForegroundColor Cyan
 & $pgDump "--dbname=$connection" '--format=custom' '--no-owner' '--no-acl' "--file=$target"
 if ($LASTEXITCODE -ne 0) { throw "pg_dump termino con codigo $LASTEXITCODE. Copia incompleta o error de conexion." }
 if (-not (Test-Path $target) -or (Get-Item $target).Length -lt 500) { throw 'El archivo no se creo o parece incompleto.' }
 Write-Host 'Verificando estructura del archivo...' -ForegroundColor Cyan
 $listing = & $pgRestore '--list' "$target" 2>&1
 if ($LASTEXITCODE -ne 0) { throw "El archivo no pudo leerse con pg_restore: $listing" }
 $backupFileValidated = $true
 $hash = (Get-FileHash $target -Algorithm SHA256).Hash
 $lines = @(
  'MONKYS STORE - CONSTANCIA LOCAL DE VERIFICACION',
  "Archivo: $(Split-Path $target -Leaf)",
  "Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "Tamaño (bytes): $((Get-Item $target).Length)",
  "SHA256: $hash",
  'pg_dump: finalizo correctamente',
  'pg_restore --list: archivo legible',
  'IMPORTANTE: ESTO NO GARANTIZA UNA RESTAURACION EXITOSA.',
  'Para comprobar restauracion, usar un proyecto Supabase de pruebas separado.',
  'Storage: los objetos/fotos de Supabase Storage NO estan dentro de este archivo.',
  'Confidencial: cifrar antes de compartir o subir a la nube.'
 )
 $lines | Set-Content -Path $manifest -Encoding UTF8
 Write-Host 'RESPALDO CREADO Y ARCHIVO LEGIBLE' -ForegroundColor Green
 Write-Host "Carpeta: $folder"
 Write-Host "Archivo: $(Split-Path $target -Leaf)"
 Write-Host "Constancia: $(Split-Path $manifest -Leaf)"
 Write-Host 'ATENCION: falta probar restauracion en una base de prueba y respaldar archivos de Storage.' -ForegroundColor Yellow
} catch {
 Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
 # Conservar un archivo ya verificado aunque falle la creacion de la constancia.
 if (Get-Variable target -ErrorAction SilentlyContinue) {
  if ((Test-Path -LiteralPath $target) -and -not $backupFileValidated) {
   Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
   Write-Host 'Se elimino el respaldo que no llego a verificarse.' -ForegroundColor Yellow
  } elseif (Test-Path -LiteralPath $target) {
   Write-Host "El respaldo legible permanece guardado en: $target" -ForegroundColor Yellow
  }
 }
} finally {
 Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
 Remove-Item Env:\PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
 Pause-Guide
}

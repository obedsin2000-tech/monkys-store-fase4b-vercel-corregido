$ErrorActionPreference='Continue'
function Heading([string]$name){Write-Host "`n$name" -ForegroundColor Cyan}
Write-Host "MONKY'S STORE FASE 4A - VERIFICACION LOCAL" -ForegroundColor Cyan
Heading '1. Version Node.js'
try{node --version}catch{Write-Host 'No se encuentra Node.js' -ForegroundColor Yellow}
Heading '2. Version npm'
try{npm.cmd --version}catch{Write-Host 'No se encuentra npm' -ForegroundColor Yellow}
Heading '3. Conexion del proyecto (sin mostrar claves)'
$root=Split-Path $PSScriptRoot -Parent
$envfile=Join-Path $root '.env.local'
if(Test-Path $envfile){
 $lines=Get-Content $envfile
 foreach($key in @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY')){
  $matched = @($lines | Where-Object {$_ -match "^\s*$key\s*=\s*[^\s#]+"})
  if($matched.Count -gt 0){Write-Host "$key : definido" -ForegroundColor Green}else{Write-Host "$key : falta definir" -ForegroundColor Yellow}
 }
}else{Write-Host '.env.local no existe en esta carpeta. Copialo de tu Fase 3.' -ForegroundColor Yellow}
Heading '4. Herramienta de respaldo'
$pg=Get-Command pg_dump.exe -ErrorAction SilentlyContinue
if($pg){Write-Host 'pg_dump detectado.' -ForegroundColor Green}else{Write-Host 'pg_dump no esta en PATH; el respaldo puede localizarlo en la carpeta PostgreSQL. Revisa la guia.' -ForegroundColor Yellow}
Heading '5. Archivos de migracion'
foreach($name in @('001_fase1.sql','002_fase2.sql','003_fase3.sql','004_fase4a.sql')){
 $f=Join-Path $root "supabase\migrations\$name"
 if(Test-Path $f){Write-Host "$name : presente" -ForegroundColor Green}else{Write-Host "$name : falta" -ForegroundColor Red}
}
Write-Host "`nNo se ha enviado ninguna credencial ni se ha modificado Supabase."
Read-Host 'Presiona ENTER para cerrar' | Out-Null

# Creates the dedicated Spleeter 2stems venv for Vocal Remover.
# Does NOT touch .venv-diarization, VieNeu, or the old UVR .venv.
#
# Usage (from lemyloi-dichvideo):
#   powershell -ExecutionPolicy Bypass -File scripts/setup-vocal-isolation.ps1
#
# After this, GET /api/vocal-isolation?capability=status should report ready.
# Do not commit .local-services/ or the model files.

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ServiceDir = Join-Path $RepoRoot ".local-services\vocal-isolation"
$VenvDir = Join-Path $ServiceDir ".venv-spleeter"
$PythonExe = Join-Path $VenvDir "Scripts\python.exe"
$Requirements = Join-Path $RepoRoot "requirements-vocal-isolation.txt"
$ModelRoot = Join-Path $ServiceDir "models\spleeter"
$ModelDir = Join-Path $ModelRoot "2stems"
$OutputDir = Join-Path $ServiceDir "outputs"
$ModelUrl = "https://github.com/deezer/spleeter/releases/download/v1.4.0/2stems.tar.gz"

function Find-Python311 {
	$candidates = @(
		"$env:APPDATA\uv\python\cpython-3.11.15-windows-x86_64-none\python.exe",
		"$env:USERPROFILE\.local\share\uv\python\cpython-3.11.15-windows-x86_64-none\python.exe"
	)
	foreach ($name in @("python3.11", "py")) {
		$cmd = Get-Command $name -ErrorAction SilentlyContinue
		if ($cmd) { $candidates += $cmd.Source }
	}
	$uv = Get-Command uv -ErrorAction SilentlyContinue
	if ($uv) {
		try {
			$uvPy = & $uv.Source python find 3.11 2>$null
			if ($uvPy) { $candidates += $uvPy.Trim() }
		} catch {}
	}
	foreach ($candidate in $candidates) {
		if (-not $candidate -or -not (Test-Path $candidate)) { continue }
		try {
			$verText = & $candidate --version 2>&1 | Out-String
		} catch {
			continue
		}
		if ($verText -notmatch "Python\s+3\.11\.") { continue }
		return $candidate
	}
	throw "Can Python 3.11 (Spleeter khong chay tren 3.12/3.13). Cai bang: uv python install 3.11"
}

function Ensure-SpleeterModel {
	$probe = Join-Path $ModelDir ".probe"
	$weight = Join-Path $ModelDir "model.data-00000-of-00001"
	if ((Test-Path $probe) -and (Test-Path $weight)) {
		Write-Host "Model 2stems da co: $ModelDir"
		return
	}
	New-Item -ItemType Directory -Force -Path $ModelRoot, $ModelDir | Out-Null
	$archive = Join-Path $ModelRoot "2stems.tar.gz"
	Write-Host "Keo 2stems.tar.gz (curl theo 302, Spleeter httpx khong theo duoc)..."
	& curl.exe -L --fail --retry 3 -o $archive $ModelUrl
	if ($LASTEXITCODE -ne 0 -or -not (Test-Path $archive)) {
		throw "Tai model that bai. Kiem tra mang roi chay lai script."
	}
	& tar.exe -xzf $archive -C $ModelRoot
	if ($LASTEXITCODE -ne 0) { throw "Giai nen 2stems.tar.gz that bai." }
	foreach ($name in @("checkpoint", "._checkpoint", "model.data-00000-of-00001", "model.index", "model.meta")) {
		$src = Join-Path $ModelRoot $name
		if (Test-Path $src) {
			Move-Item -Force $src (Join-Path $ModelDir $name)
		}
	}
	if (-not (Test-Path $weight)) {
		throw "Khong thay model.data sau khi giai nen."
	}
	Set-Content -Path $probe -Value "OK" -Encoding ascii
	Remove-Item $archive -Force -ErrorAction SilentlyContinue
	Write-Host "Model: $ModelDir"
}

Write-Host "Repo: $RepoRoot"
New-Item -ItemType Directory -Force -Path $ServiceDir, $ModelRoot, $ModelDir, $OutputDir | Out-Null

if (-not (Test-Path $PythonExe)) {
	$systemPython = Find-Python311
	Write-Host "Tao venv 3.11 bang $systemPython"
	& $systemPython -m venv $VenvDir
	if ($LASTEXITCODE -ne 0 -or -not (Test-Path $PythonExe)) {
		throw "Khong tao duoc venv tai $VenvDir"
	}
} else {
	Write-Host "Dung lai venv: $PythonExe"
}

$venvVer = & $PythonExe --version 2>&1 | Out-String
if ($venvVer -notmatch "Python\s+3\.11\.") {
	throw "Venv khong phai Python 3.11: $venvVer. Xoa $VenvDir roi chay lai."
}

Write-Host "Cai Spleeter 2stems (venv rieng, khong dung diarization/VieNeu)..."
& $PythonExe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade that bai" }
& $PythonExe -m pip install -r $Requirements
if ($LASTEXITCODE -ne 0) { throw "Cai spleeter-thomasesr that bai" }

Ensure-SpleeterModel

Write-Host ""
Write-Host "Xong. Venv: $PythonExe"
Write-Host "Model: $ModelDir"
Write-Host "Vocal Remover dung spleeter-2stems. Khong commit .local-services/ hay checkpoint."

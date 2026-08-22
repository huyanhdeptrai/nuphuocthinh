# Pack shared CUDA torch into GitHub Release parts.
# GitHub.com limits each Release asset to 2 GB, so the zip is split into 1800 MB pieces.
#
# From lemyloi-dichvideo:
#   powershell -ExecutionPolicy Bypass -File scripts/pack-gpu-runtime.ps1 -GitHubRepo "OWNER/REPO" -Tag "gpu-2.8.0-cu126"
#
# Then:
#   gh release create gpu-2.8.0-cu126 .local-services/components/dist/* -R OWNER/REPO -t "GPU runtime 2.8.0-cu126"

param(
	[string]$GitHubRepo = "OWNER/REPO",
	[string]$Tag = "gpu-2.8.0-cu126",
	[string]$Version = "2.8.0-cu126"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkspaceRoot = if (Test-Path (Join-Path (Split-Path $RepoRoot -Parent) ".venv-diarization\Scripts\python.exe")) {
	Split-Path $RepoRoot -Parent
} else {
	$RepoRoot
}

$TorchRoot = Join-Path $WorkspaceRoot ".venv-diarization\Lib\site-packages"
$Python = Join-Path $WorkspaceRoot ".venv-diarization\Scripts\python.exe"
$OutDir = Join-Path $RepoRoot ".local-services\components\dist"
$Stage = Join-Path $RepoRoot ".local-services\components\stage-cuda"

if (-not (Test-Path $Python)) { throw "Missing $Python" }
if (-not (Test-Path (Join-Path $TorchRoot "torch\lib\torch_cuda.dll"))) {
	throw "Missing torch_cuda.dll - CUDA torch is not installed on this machine."
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

$names = @(
	"torch",
	"torch-2.8.0+cu126.dist-info",
	"torchaudio",
	"torchaudio-2.8.0+cu126.dist-info",
	"torchgen",
	"functorch",
	"torio",
	"torchcodec",
	"torchcodec-0.15.0.dist-info"
)

Write-Host "Staging CUDA overlay (skip *.lib)..."
foreach ($name in $names) {
	$src = Join-Path $TorchRoot $name
	if (-not (Test-Path $src)) { Write-Host "SKIP missing $name"; continue }
	$dst = Join-Path $Stage $name
	& robocopy $src $dst /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
	if ($LASTEXITCODE -ge 8) { throw "robocopy failed $name ($LASTEXITCODE)" }
	Get-ChildItem $dst -Recurse -Filter *.lib -File -ErrorAction SilentlyContinue | Remove-Item -Force
}

$zipName = "runtime-ml-cuda-$Version.zip"
$zipPath = Join-Path $OutDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$pyFile = Join-Path $OutDir "_pack_gpu_runtime.py"
@"
import hashlib, json, zipfile
from pathlib import Path
stage = Path(r'$Stage')
out_dir = Path(r'$OutDir')
zip_path = Path(r'$zipPath')
version = '$Version'
repo = '$GitHubRepo'
tag = '$Tag'
part_size = 1800 * 1024 * 1024

print('Zipping ZIP64 stored...')
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
    for path in sorted(stage.rglob('*')):
        if path.is_file():
            zf.write(path, path.relative_to(stage).as_posix())

def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024 * 8), b''):
            h.update(chunk)
    return h.hexdigest()

full_size = zip_path.stat().st_size
full_hash = sha256(zip_path)
print('zip', full_size, 'bytes sha256=', full_hash)

parts = []
with open(zip_path, 'rb') as src:
    index = 1
    while True:
        blob = src.read(part_size)
        if not blob:
            break
        name = f'{zip_path.name}.{index:03d}'
        dest = out_dir / name
        dest.write_bytes(blob)
        digest = hashlib.sha256(blob).hexdigest()
        url = f'https://github.com/{repo}/releases/download/{tag}/{name}'
        parts.append({'name': name, 'url': url, 'sha256': digest, 'size': dest.stat().st_size})
        print('part', name, dest.stat().st_size, digest)
        index += 1

manifest = {
    'id': 'runtime-ml-cuda',
    'version': version,
    'minVramMb': 4096,
    'size': full_size,
    'sha256': full_hash,
    'parts': parts,
}
manifest_path = out_dir / 'manifest.json'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print('wrote', manifest_path)
"@ | Set-Content -Path $pyFile -Encoding ascii

Write-Host "Zipping (ZIP64, stored)..."
& $Python $pyFile
if ($LASTEXITCODE -ne 0) { throw "pack failed" }
Remove-Item $pyFile -Force
Write-Host "Done. Dist: $OutDir"

param(
	[switch]$Force
)

$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimeRoot = Join-Path $projectRoot ".local-services\ocr-runtime"
$pythonRoot = Join-Path $runtimeRoot "python"
$runtimePython = Join-Path $pythonRoot "python.exe"
$requirements = Join-Path $projectRoot "requirements-ocr-runtime.txt"
$pythonVersion = "3.13.7"
$embedUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"

function Test-OcrRuntime {
	if (-not (Test-Path $runtimePython)) { return $false }
	& $runtimePython -c "import cv2, onnxruntime, rapidocr; print(rapidocr.__version__ if hasattr(rapidocr, '__version__') else 'rapidocr')"
	return $LASTEXITCODE -eq 0
}

if (-not $Force -and (Test-OcrRuntime)) {
	Write-Host "OCR runtime is already ready: $runtimePython"
	return
}

if (-not (Test-Path $requirements)) {
	throw "Missing OCR runtime requirements: $requirements"
}

$buildPython = (Get-Command python -ErrorAction Stop).Source
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lemyloi-ocr-runtime-" + [guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $temporaryRoot "python-embed.zip"

try {
	New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null
	Invoke-WebRequest -Uri $embedUrl -OutFile $archivePath
	if (Test-Path $runtimeRoot) {
		Remove-Item -LiteralPath $runtimeRoot -Recurse -Force
	}
	New-Item -ItemType Directory -Path $pythonRoot -Force | Out-Null
	Expand-Archive -LiteralPath $archivePath -DestinationPath $pythonRoot -Force

	$pthPath = Join-Path $pythonRoot "python313._pth"
	@(
		"python313.zip",
		".",
		"Lib/site-packages",
		"import site"
	) | Set-Content -LiteralPath $pthPath -Encoding ascii

	$sitePackages = Join-Path $pythonRoot "Lib\site-packages"
	New-Item -ItemType Directory -Path $sitePackages -Force | Out-Null
	& $buildPython -m pip --python $runtimePython install --disable-pip-version-check --no-warn-script-location --target $sitePackages -r $requirements
	if ($LASTEXITCODE -ne 0) { throw "Could not install the pinned OCR packages." }

	# Download the exact Chinese subtitle detector/recognizer once while packaging.
	# The installed EXE then works offline and never needs a model registry from
	# the user's Python installation.
	$bootstrap = @'
from rapidocr import RapidOCR
from rapidocr.utils.typings import ModelType, OCRVersion
for version, model in ((OCRVersion.PPOCRV6, ModelType.SMALL), (OCRVersion.PPOCRV6, ModelType.TINY)):
    RapidOCR(params={
        "Global.log_level": "error",
        "Det.ocr_version": version,
        "Det.model_type": model,
        "Det.lang_type": "ch",
        "Det.limit_type": "max",
        "Det.limit_side_len": 736,
        "Rec.ocr_version": version,
        "Rec.model_type": model,
        "Rec.lang_type": "ch",
    })
print("OCR runtime and offline subtitle models are ready")
'@
	$bootstrapPath = Join-Path $temporaryRoot "preload_ocr_models.py"
	Set-Content -LiteralPath $bootstrapPath -Value $bootstrap -Encoding utf8
	& $runtimePython $bootstrapPath
	if ($LASTEXITCODE -ne 0) { throw "Could not preload the offline OCR models." }
	if (-not (Test-OcrRuntime)) { throw "The prepared OCR runtime did not pass verification." }
	Write-Host "Prepared portable OCR runtime: $runtimeRoot"
} finally {
	if (Test-Path $temporaryRoot) {
		Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
	}
}

param(
  [string]$OutputRoot = (Join-Path (Get-Location) 'dist-tts-packs'),
  [string[]]$Engine = @('vieneu', 'supertonic', 'omnivoice')
)
$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$pythonRoot = 'C:\Users\LEMYLOI\AppData\Roaming\uv\python'
$hfRoot = 'C:\Users\LEMYLOI\.cache\huggingface\hub'
$releaseBase = 'https://github.com/Lexombien/editkub-gpu-runtime/releases/download'
$vieNeuOfficialVoicesUrl = 'https://raw.githubusercontent.com/pnnbao97/VieNeu-TTS/main/src/vieneu/assets/voices_v3_turbo.json'
$engines = @(
  @{ Id='vieneu'; Py='cpython-3.12-windows-x86_64-none'; Models=@('models--pnnbao-ump--VieNeu-Codec','models--pnnbao-ump--VieNeu-TTS-v3-Turbo','models--pnnbao-ump--VieNeu-TTS-v2-Turbo-GGUF'); Data=@('custom-voices.json','custom-voices-v2.json') },
  @{ Id='supertonic'; Py='cpython-3.12-windows-x86_64-none'; Models=@(); Data=@() },
  # OmniVoice model cache is multi-GB and is fetched lazily by its worker; keep the engine pack installable and removable.
  @{ Id='omnivoice'; Py='cpython-3.11-windows-x86_64-none'; Models=@(); Data=@('voices.json') }
)
New-Item -ItemType Directory -Force $OutputRoot | Out-Null
foreach ($e in $engines) {
  if ($e.Id -notin $Engine) { continue }
  $stage = Join-Path $OutputRoot "stage-$($e.Id)"
  $engineRoot = Join-Path $stage "tts-$($e.Id)"
  if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  New-Item -ItemType Directory -Force $engineRoot | Out-Null
  Write-Host "[$($e.Id)] Python"
  Copy-Item -LiteralPath (Join-Path $pythonRoot $e.Py) -Destination (Join-Path $engineRoot 'python') -Recurse
  Write-Host "[$($e.Id)] site-packages"
  Copy-Item -LiteralPath (Join-Path $repo ".local-services\$($e.Id)\.venv\Lib\site-packages") -Destination (Join-Path $engineRoot 'site-packages') -Recurse
  if ($e.Id -eq 'vieneu') {
    # Keep built-in presets aligned with the official VieNeu repository. This adds
    # new official voices (such as Adam) without treating them as user clones.
    $voicesPath = Join-Path $engineRoot 'site-packages\vieneu\assets\voices_v3_turbo.json'
    Invoke-WebRequest -Uri $vieNeuOfficialVoicesUrl -OutFile $voicesPath
    $voices = Get-Content -Raw $voicesPath | ConvertFrom-Json
    if ($null -eq $voices.presets.Adam) { throw 'Official VieNeu preset Adam was not found.' }
  }
  New-Item -ItemType Directory -Force (Join-Path $engineRoot 'data') | Out-Null
  foreach ($file in $e.Data) { $src = Join-Path $repo ".local-services\$($e.Id)\data\$file"; if (Test-Path $src) { Copy-Item $src (Join-Path $engineRoot 'data') } }
  if ($e.Id -eq 'omnivoice') { $src = Join-Path $repo '.local-services\omnivoice\data\prompts'; if (Test-Path $src) { Copy-Item $src (Join-Path $engineRoot 'data') -Recurse } }
  if ($e.Models.Count -gt 0) {
    $hub = Join-Path $engineRoot 'models\hub'; New-Item -ItemType Directory -Force $hub | Out-Null
    foreach ($model in $e.Models) { $src = Join-Path $hfRoot $model; if (!(Test-Path $src)) { throw "Missing HF model $model" }; if ($e.Id -eq 'omnivoice' -and (Test-Path (Join-Path $src 'snapshots'))) { $dst = Join-Path $hub $model; New-Item -ItemType Directory -Force $dst | Out-Null; Copy-Item (Join-Path $src 'snapshots') $dst -Recurse; Copy-Item (Join-Path $src 'refs') $dst -Recurse -ErrorAction SilentlyContinue } else { Copy-Item $src $hub -Recurse } }
  }
  $version = if ($e.Id -eq 'vieneu') { '1.0.1' } else { '1.0.0' }
  $tag = "tts-$($e.Id)-$version"
  $archive = Join-Path $OutputRoot "$($e.Id)-$version.zip"
  Write-Host "[$($e.Id)] archive"
  tar.exe -a -c -f $archive -C $stage "tts-$($e.Id)"
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
  $size = (Get-Item -LiteralPath $archive).Length
  $partSize = 1800MB
  $parts = @()
  if ($size -le $partSize) { $parts += @{ Name=(Split-Path $archive -Leaf); Url="$releaseBase/$tag/$([uri]::EscapeDataString((Split-Path $archive -Leaf)))"; Sha256=$hash; Size=$size } }
  else {
    $input = [IO.File]::OpenRead($archive); $index=1
    try { while ($input.Position -lt $input.Length) { $count=[Math]::Min([int64]$partSize, $input.Length-$input.Position); $name="$($e.Id)-$version.part$index"; $partPath=Join-Path $OutputRoot $name; $output=[IO.File]::Create($partPath); try { $remaining=$count; $buffer=[byte[]]::new(8MB); while ($remaining -gt 0) { $read=$input.Read($buffer,0,[Math]::Min($buffer.Length,$remaining)); if ($read -le 0) { break }; $output.Write($buffer,0,$read); $remaining-=$read } } finally { $output.Dispose() }; $ph=(Get-FileHash -Algorithm SHA256 -LiteralPath $partPath).Hash.ToLowerInvariant(); $parts += @{Name=$name; Url="$releaseBase/$tag/$name"; Sha256=$ph; Size=$count}; $index++ } } finally { $input.Dispose() }
  }
  $manifest = [ordered]@{ id="tts-$($e.Id)"; engine=$e.Id; version=$version; size=$size; sha256=$hash; parts=$parts }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $OutputRoot "$($e.Id)-manifest.json")
  Remove-Item -LiteralPath $stage -Recurse -Force
}
Write-Host "Packs ready in $OutputRoot"

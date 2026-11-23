# Uzay Görevi — tek dosya derleyici
# kaynak/oyun.html + kutuphane/*.js + sahne3d.js + dokular/*.jpg  →  ../uzay-gorevi.html ve ../index.html
# Çalıştırma:  powershell -ExecutionPolicy Bypass -File derle.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object System.Text.UTF8Encoding $false
function ReadText($p) { [IO.File]::ReadAllText((Join-Path $here $p), $utf8) }

$vendor = @('three.min.js','CopyShader.js','LuminosityHighPassShader.js','GammaCorrectionShader.js','EffectComposer.js','MaskPass.js','RenderPass.js','ShaderPass.js','UnrealBloomPass.js')
$sb = New-Object System.Text.StringBuilder
foreach ($v in $vendor) { [void]$sb.Append("<script>`n").Append((ReadText "kutuphane\$v")).Append("`n</script>`n") }

$tex = New-Object System.Text.StringBuilder
[void]$tex.Append("<script>window.TEX={")
$first = $true
foreach ($f in Get-ChildItem (Join-Path $here 'dokular') -Filter *.jpg | Sort-Object Name) {
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
  if (-not $first) { [void]$tex.Append(',') }
  [void]$tex.Append($f.BaseName).Append(":'data:image/jpeg;base64,").Append($b64).Append("'")
  $first = $false
}
[void]$tex.Append("};</script>`n")
[void]$sb.Append($tex.ToString())
[void]$sb.Append("<script>`n").Append((ReadText 'sahne3d.js')).Append("`n</script>`n")

$html = ReadText 'oyun.html'
if (-not $html.Contains('<!--@@VENDOR@@-->')) { throw 'oyun.html icinde <!--@@VENDOR@@--> yok' }
$html = $html.Replace('<!--@@VENDOR@@-->', $sb.ToString())
# uzay-gorevi.html: çift tıklayarak açmak için · index.html: GitHub Pages ana sayfası (ikisi aynı)
foreach ($name in @('uzay-gorevi.html', 'index.html')) {
  $out = Join-Path (Split-Path -Parent $here) $name
  [IO.File]::WriteAllText($out, $html, $utf8)
  "Yazildi: $out  ({0:N0} KB)" -f ((Get-Item $out).Length / 1KB)
}

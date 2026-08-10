# Renders marketing/itch-cover.png (630x500) — itch.io cover image.
# Run: powershell -ExecutionPolicy Bypass -File tools\make-itch-cover.ps1
Add-Type -AssemblyName System.Drawing

$W = 630; $H = 500
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"
$g.TextRenderingHint = "AntiAliasGridFit"

$tape  = [System.Drawing.Color]::FromArgb(255, 201, 51)
$ink   = [System.Drawing.Color]::FromArgb(27, 39, 51)
$paper = [System.Drawing.Color]::FromArgb(250, 250, 247)
$inkBrush   = New-Object System.Drawing.SolidBrush($ink)
$paperBrush = New-Object System.Drawing.SolidBrush($paper)
$tapeBrush  = New-Object System.Drawing.SolidBrush($tape)

$g.Clear($tape)

# ruler ticks along the bottom
$tickBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 27, 39, 51))
for ($x = 20; $x -lt $W; $x += 44) {
  $tall = (($x - 20) / 44) % 4 -eq 0
  $h2 = if ($tall) { 34 } else { 20 }
  $g.FillRectangle($tickBrush, $x, $H - $h2 - 12, 5, $h2)
}

# bracket-dot mark, centered upper
$fMono = New-Object System.Drawing.Font("Consolas", 64, [System.Drawing.FontStyle]::Bold)
$markSize = $g.MeasureString("[ ]", $fMono)
$mx = [int](($W - $markSize.Width) / 2)
$g.DrawString("[", $fMono, $inkBrush, $mx, 56)
$g.FillEllipse($inkBrush, $mx + 52, 96, 36, 36)
$g.DrawString("]", $fMono, $inkBrush, $mx + 96, 56)

# wordmark
$fBig = New-Object System.Drawing.Font("Segoe UI Black", 52, [System.Drawing.FontStyle]::Bold)
$w1 = $g.MeasureString("BALLPARK", $fBig)
$g.DrawString("BALLPARK", $fBig, $inkBrush, [int](($W - $w1.Width) / 2), 160)

# tagline
$fTag = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Regular)
$tag = "Trap the number. Daily."
$w2 = $g.MeasureString($tag, $fTag)
$g.DrawString($tag, $fTag, $inkBrush, [int](($W - $w2.Width) / 2), 258)

# slider illustration
$tx = 65; $ty = 340; $tw = 500; $th = 58
$g.FillRectangle($paperBrush, $tx, $ty, $tw, $th)
$pen = New-Object System.Drawing.Pen($ink, 5)
$g.DrawRectangle($pen, $tx, $ty, $tw, $th)
$span = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 255, 201, 51))
$g.FillRectangle($span, $tx + 140, $ty, 230, $th)
$fH = New-Object System.Drawing.Font("Consolas", 30, [System.Drawing.FontStyle]::Bold)
foreach ($hx in @(($tx + 115), ($tx + 345))) {
  $g.FillRectangle($tapeBrush, $hx, $ty - 16, 50, $th + 32)
  $g.DrawRectangle($pen, $hx, $ty - 16, 50, $th + 32)
}
$g.DrawString("[", $fH, $inkBrush, $tx + 126, $ty - 2)
$g.DrawString("]", $fH, $inkBrush, $tx + 356, $ty - 2)
$needle = New-Object System.Drawing.Pen($ink, 6)
$g.DrawLine($needle, $tx + 285, $ty - 28, $tx + 285, $ty + $th + 12)
$g.FillEllipse($inkBrush, $tx + 275, $ty - 46, 20, 20)

$out = Join-Path (Split-Path $PSScriptRoot -Parent) "marketing\itch-cover.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote $out"

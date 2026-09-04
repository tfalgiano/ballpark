# Renders og.png (1200x630) — the link-preview card for iMessage/Discord/Slack/X.
# Run: powershell -ExecutionPolicy Bypass -File tools\make-og.ps1
Add-Type -AssemblyName System.Drawing

$W = 1200; $H = 630
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

# background
$g.Clear($tape)

# faint ruler ticks along the bottom edge
$tickBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 27, 39, 51))
for ($x = 40; $x -lt $W; $x += 58) {
  $tall = (($x - 40) / 58) % 4 -eq 0
  $h2 = if ($tall) { 46 } else { 26 }
  $g.FillRectangle($tickBrush, $x, $H - $h2 - 18, 7, $h2)
}

# wordmark with bracket-dot mark, centered as one lock-up
$fBig = New-Object System.Drawing.Font("Segoe UI Black", 64, [System.Drawing.FontStyle]::Bold)
$fMono = New-Object System.Drawing.Font("Consolas", 76, [System.Drawing.FontStyle]::Bold)
$wordSize = $g.MeasureString("HALFSURE", $fBig)
$markW = 200
$lockW = $markW + $wordSize.Width
$x0 = [int](($W - $lockW) / 2)
$y0 = 112
$g.DrawString("[", $fMono, $inkBrush, $x0, $y0 - 4)
$g.FillEllipse($inkBrush, $x0 + 62, $y0 + 44, 42, 42)
$g.DrawString("]", $fMono, $inkBrush, $x0 + 120, $y0 - 4)
$g.DrawString("HALFSURE", $fBig, $inkBrush, $x0 + $markW, $y0)

# tagline, centered
$fTag = New-Object System.Drawing.Font("Segoe UI", 30, [System.Drawing.FontStyle]::Regular)
$tag = "Don't guess the number - trap it. Five questions a day."
$tagSize = $g.MeasureString($tag, $fTag)
$g.DrawString($tag, $fTag, $inkBrush, [int](($W - $tagSize.Width) / 2), 282)

# slider illustration: track with span, handles, needle inside the span
$tx = 244; $ty = 400; $tw = 712; $th = 84
$g.FillRectangle($paperBrush, $tx, $ty, $tw, $th)
$pen = New-Object System.Drawing.Pen($ink, 6)
$g.DrawRectangle($pen, $tx, $ty, $tw, $th)
# span fill between handles
$span = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 255, 201, 51))
$g.FillRectangle($span, $tx + 210, $ty, 310, $th)
# handles
$fH = New-Object System.Drawing.Font("Consolas", 44, [System.Drawing.FontStyle]::Bold)
foreach ($hx in @(($tx + 175), ($tx + 485))) {
  $g.FillRectangle($tapeBrush, $hx, $ty - 22, 70, $th + 44)
  $g.DrawRectangle($pen, $hx, $ty - 22, 70, $th + 44)
}
$g.DrawString("[", $fH, $inkBrush, $tx + 187, $ty - 6)
$g.DrawString("]", $fH, $inkBrush, $tx + 499, $ty - 6)
# the truth needle, inside the span
$needle = New-Object System.Drawing.Pen($ink, 8)
$g.DrawLine($needle, $tx + 410, $ty - 40, $tx + 410, $ty + $th + 16)
$g.FillEllipse($inkBrush, $tx + 396, $ty - 66, 28, 28)

$out = Join-Path (Split-Path $PSScriptRoot -Parent) "og.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote $out"

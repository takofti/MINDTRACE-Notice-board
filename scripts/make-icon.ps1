Add-Type -AssemblyName System.Drawing

$size = 512
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

$outer = New-RoundedPath 28 28 456 456 108
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.PointF(40, 30)),
  (New-Object System.Drawing.PointF(470, 500)),
  [System.Drawing.Color]::FromArgb(255, 36, 39, 46),
  [System.Drawing.Color]::FromArgb(255, 14, 15, 19)
)
$graphics.FillPath($bgBrush, $outer)

$innerGlow = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.PointF(80, 60)),
  (New-Object System.Drawing.PointF(380, 300)),
  [System.Drawing.Color]::FromArgb(60, 255, 255, 255),
  [System.Drawing.Color]::FromArgb(0, 255, 255, 255)
)
$graphics.FillPath($innerGlow, $outer)

# Red thread
$threadPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 200, 85, 61), 17)
$threadPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$threadPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$threadPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$threadPath.AddBezier(112, 350, 210, 110, 330, 460, 424, 208)
$graphics.DrawPath($threadPen, $threadPath)

$thread2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 214, 208, 195), 8)
$thread2.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$thread2.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$threadPath2 = New-Object System.Drawing.Drawing2D.GraphicsPath
$threadPath2.AddBezier(120, 240, 220, 420, 300, 180, 402, 340)
$graphics.DrawPath($thread2, $threadPath2)

# Pins
function Draw-Pin([float]$x, [float]$y, [float]$r, [System.Drawing.Color]$color) {
  $shadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 0, 0, 0))
  $graphics.FillEllipse($shadow, $x - $r + 4, $y - $r + 8, $r * 2, $r * 2)
  $rim = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 45, 39, 31))
  $graphics.FillEllipse($rim, $x - $r, $y - $r, $r * 2, $r * 2)
  $brush = New-Object System.Drawing.SolidBrush($color)
  $graphics.FillEllipse($brush, $x - $r + 3, $y - $r + 3, ($r - 3) * 2, ($r - 3) * 2)
  $highlight = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 255, 255, 255))
  $graphics.FillEllipse($highlight, $x - $r * 0.45, $y - $r * 0.55, $r * 0.42, $r * 0.36)
}
Draw-Pin 414 208 26 ([System.Drawing.Color]::FromArgb(255, 215, 201, 167))
Draw-Pin 112 350 22 ([System.Drawing.Color]::FromArgb(255, 200, 85, 61))

# Monogram
$font = New-Object System.Drawing.Font('Palatino Linotype', 250, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 240, 228))
$graphics.DrawString('M', $font, $textBrush, (New-Object System.Drawing.RectangleF(70, 210, 372, 240)), $format)

$graphics.Dispose()
$outDir = Join-Path $PSScriptRoot '..\build'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$bitmap.Save((Join-Path $outDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$small = New-Object System.Drawing.Bitmap($bitmap, 256, 256)
$small.Save((Join-Path $outDir 'icon-256.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$small.Dispose()
$bitmap.Dispose()
Write-Output 'Wrote build/icon.png and build/icon-256.png'

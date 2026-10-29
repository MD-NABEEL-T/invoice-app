Add-Type -AssemblyName System.Drawing

function Resize-Image($src, $dest, $width, $height) {
    $srcImg = [System.Drawing.Image]::FromFile($src)
    $newImg = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($newImg)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($srcImg, 0, 0, $width, $height)
    $newImg.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $newImg.Dispose()
    $srcImg.Dispose()
    Write-Host "Generated $dest ($width x $height)"
}

Resize-Image "public/KhansaEnterprises.jpg" "public/icons/icon-192.png" 192 192
Resize-Image "public/KhansaEnterprises.jpg" "public/icons/icon-512.png" 512 512
Resize-Image "public/KhansaEnterprises.jpg" "public/apple-touch-icon.png" 180 180
Resize-Image "public/KhansaEnterprises.jpg" "public/favicon.png" 64 64


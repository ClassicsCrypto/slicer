# Slicer Font Installer — Bebas Neue + Montserrat for FFmpeg subtitle burn-in
# Run as: powershell -ExecutionPolicy Bypass -File server/install-fonts.ps1

$fontsDir = "$env:LOCALAPPDATA\Microsoft\Windows\Fonts"
if (!(Test-Path $fontsDir)) { New-Item -ItemType Directory -Force -Path $fontsDir | Out-Null }

$regPath = "HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"

$fontUrls = @(
    @{ Name = "BebasNeue-Regular"; Url = "https://github.com/googlefonts/bebas-neue/raw/main/fonts/ttf/BebasNeue-Regular.ttf" },
    @{ Name = "Montserrat-Bold"; Url = "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf" },
    @{ Name = "Montserrat-Regular"; Url = "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Regular.ttf" },
    @{ Name = "Montserrat-SemiBold"; Url = "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-SemiBold.ttf" }
)

foreach ($font in $fontUrls) {
    $dest = "$fontsDir\$($font.Name).ttf"
    Write-Host "Downloading $($font.Name)..." -ForegroundColor Cyan
    try {
        Invoke-WebRequest -Uri $font.Url -OutFile $dest -UseBasicParsing
        New-ItemProperty -Path $regPath -Name "$($font.Name) (TrueType)" -Value $dest -PropertyType String -Force | Out-Null
        Write-Host "  Installed: $($font.Name).ttf" -ForegroundColor Green
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done! Fonts installed to $fontsDir" -ForegroundColor Green
Write-Host "Restart node server/youtube-api.js for FFmpeg to pick them up." -ForegroundColor Yellow

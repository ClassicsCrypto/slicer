# Slicer Font Installer — Bebas Neue + Montserrat for FFmpeg subtitle burn-in
# Run as: powershell -ExecutionPolicy Bypass -File server/install-fonts.ps1

$fontsDir = "$env:TEMP\slicer-fonts"
New-Item -ItemType Directory -Force -Path $fontsDir | Out-Null

$fonts = @(
    @{ Name = "Bebas Neue"; Url = "https://fonts.google.com/download?family=Bebas+Neue"; Zip = "BebasNeue.zip" },
    @{ Name = "Montserrat"; Url = "https://fonts.google.com/download?family=Montserrat"; Zip = "Montserrat.zip" }
)

foreach ($font in $fonts) {
    $zipPath = "$fontsDir\$($font.Zip)"
    $extractDir = "$fontsDir\$($font.Name)"
    
    Write-Host "Downloading $($font.Name)..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $font.Url -OutFile $zipPath -UseBasicParsing
    
    Write-Host "Extracting..." -ForegroundColor Cyan
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    
    # Install each TTF/OTF file
    Get-ChildItem -Path $extractDir -Recurse -Include "*.ttf","*.otf" | ForEach-Object {
        $dest = "$env:LOCALAPPDATA\Microsoft\Windows\Fonts\$($_.Name)"
        Copy-Item $_.FullName -Destination $dest -Force
        
        # Register in registry for current user
        $regPath = "HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
        $fontName = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
        New-ItemProperty -Path $regPath -Name "$fontName (TrueType)" -Value $dest -PropertyType String -Force | Out-Null
        
        Write-Host "  Installed: $($_.Name)" -ForegroundColor Green
    }
}

# Cleanup
Remove-Item -Recurse -Force $fontsDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done! Bebas Neue + Montserrat installed." -ForegroundColor Green
Write-Host "Restart node server/youtube-api.js for FFmpeg to pick them up." -ForegroundColor Yellow

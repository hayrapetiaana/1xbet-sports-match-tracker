# One-Click Deploy Script to GitHub and Vercel
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 🚀 1xBet Match Tracker - Auto Deployer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: GitHub Authentication & Push
Write-Host "`n[1/2] Connecting to GitHub..." -ForegroundColor Yellow

$ghStatus = & "C:\Program Files\GitHub CLI\gh.exe" auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Please authorize GitHub in your browser window that will now open..." -ForegroundColor Green
    & "C:\Program Files\GitHub CLI\gh.exe" auth login --web --git-protocol https
}

Write-Host "Creating / Syncing GitHub repository..." -ForegroundColor Yellow
& "C:\Program Files\GitHub CLI\gh.exe" repo create 1xbet-sports-match-tracker --public --source=. --remote=origin --push

if ($LASTEXITCODE -ne 0) {
    Write-Host "If repo already exists, pushing updates to main branch..." -ForegroundColor Yellow
    git push -u origin main
}

Write-Host "`n✔ Successfully pushed to GitHub!" -ForegroundColor Green

# Step 2: Vercel Deploy
Write-Host "`n[2/2] Deploying to Vercel (Free Hosting)..." -ForegroundColor Yellow
Write-Host "Running Vercel deployment..." -ForegroundColor Green
vercel --prod

Write-Host "`n🎉 All done! Your project is now live on the internet." -ForegroundColor Cyan

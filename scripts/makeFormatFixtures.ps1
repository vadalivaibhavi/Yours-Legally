# Step 2 of npm run fixtures:formats (Windows, needs Microsoft Word and Edge).
# Word opens each HTML page and saves .docx / .pdf; scans are Edge screenshots placed in a Word document
# and saved as an image-only PDF (no text layer), like a scanner's output.
# Each Word conversion runs in its own job with a time limit: a hidden Word prompt can otherwise hang the run.
param([string]$OutDir = "")   # default: test-uploads/formats
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$html = Join-Path $root "test-uploads\formats\html"
$out = if ($OutDir) { $OutDir } else { Join-Path $root "test-uploads\formats" }
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$profileDir = Join-Path $env:TEMP "yl-edge-profile"

function Invoke-Word([scriptblock]$body, [object[]]$params, [string]$what) {
  $job = Start-Job -ScriptBlock $body -ArgumentList $params
  if (Wait-Job $job -Timeout 90) { Receive-Job $job }
  else {
    Stop-Job $job
    Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt (Get-Date).AddMinutes(-3) } | Stop-Process -Force
    Write-Output "TIMEOUT $what"
  }
}

# Word and PDF files: open the HTML as a web page (format 7, not read-only) and save.
foreach ($f in Get-ChildItem $html -Filter "*.html" | Where-Object { $_.Name -notmatch "\.scan-" }) {
  Invoke-Word {
    param($path, $outDir)
    $key, $fmt = (Split-Path $path -Leaf).Replace(".html", "").Split(".")
    $w = New-Object -ComObject Word.Application; $w.Visible = $false; $w.DisplayAlerts = 0
    try {
      $d = $w.Documents.Open($path, $false, $false, $false, "", "", $false, "", "", 7)
      if ($fmt -like "docx*") { $d.SaveAs2("$outDir\$key.docx", 16) } else { $d.SaveAs2("$outDir\$key.pdf", 17) }
      $d.Close(0); "saved $key ($fmt)"
    } finally { $w.Quit() }
  } @($f.FullName, $out) $f.Name
}

# Scans: Edge screenshots each page (URL-encoded path, own profile), Word places them as images and saves a PDF.
$pngs = @()
foreach ($p in Get-ChildItem $html -Filter "*.scan-*.html") {
  $url = "file:///" + $p.FullName.Replace("\", "/").Replace(" ", "%20")
  $png = Join-Path $env:TEMP ("yl-scan-" + $p.BaseName + ".png")
  $proc = Start-Process $edge -ArgumentList "--headless=new --disable-gpu --user-data-dir=$profileDir --no-first-run --hide-scrollbars --window-size=1000,1400 --screenshot=$png $url" -PassThru -WindowStyle Hidden
  if (-not $proc.WaitForExit(40000)) { $proc.Kill() }
  $pngs += Get-Item $png
}
foreach ($g in $pngs | Group-Object { $_.Name.Split(".")[0].Replace("yl-scan-", "") }) {
  Invoke-Word {
    param($key, $files, $outDir)
    $w = New-Object -ComObject Word.Application; $w.Visible = $false; $w.DisplayAlerts = 0
    try {
      $d = $w.Documents.Add(); $ps = $d.PageSetup; $ps.TopMargin = 20; $ps.BottomMargin = 20; $ps.LeftMargin = 20; $ps.RightMargin = 20
      $i = 0
      foreach ($png in $files) {
        $r = $d.Content; $r.Collapse(0)
        if ($i -gt 0) { $r.InsertBreak(7); $r = $d.Content; $r.Collapse(0) }   # page break
        $pic = $d.InlineShapes.AddPicture($png, $false, $true, $r); $pic.LockAspectRatio = -1; $pic.Height = 740
        $i++
      }
      $d.SaveAs2("$outDir\$key.scan.pdf", 17); $d.Close(0); "saved $key (scan, $i pages)"
    } finally { $w.Quit() }
  } @($g.Name, ($g.Group | Sort-Object Name | ForEach-Object FullName), $out) $g.Name
}

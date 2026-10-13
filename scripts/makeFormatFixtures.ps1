# Step 2 of npm run fixtures:formats (Windows, needs Microsoft Word and Edge).
# Word opens each HTML page and saves .docx / .pdf; scans are Edge screenshots placed in a Word document
# and saved as an image-only PDF (no text layer), like a scanner's output.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$html = Join-Path $root "test-uploads\formats\html"
$out = Join-Path $root "test-uploads\formats"
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  foreach ($f in Get-ChildItem $html -Filter "*.html" | Where-Object { $_.Name -notmatch "\.scan-" }) {
    $key, $fmt = $f.BaseName.Split(".")
    $doc = $word.Documents.Open($f.FullName, $false, $false, $false, "", "", $false, "", "", 7)   # as a web page (read-only HTML opens hang on a hidden prompt)
    if ($fmt -like "docx*") { $doc.SaveAs2((Join-Path $out "$key.docx"), 16) }   # wdFormatDocumentDefault
    else { $doc.SaveAs2((Join-Path $out "$key.pdf"), 17) }                        # wdFormatPDF
    $doc.Close(0)
    Write-Output "saved $key ($fmt)"
  }
  $scans = Get-ChildItem $html -Filter "*.scan-*.html" | Group-Object { $_.BaseName.Split(".")[0] }
  foreach ($g in $scans) {
    $doc = $word.Documents.Add()
    $doc.PageSetup.TopMargin = 18; $doc.PageSetup.BottomMargin = 18; $doc.PageSetup.LeftMargin = 18; $doc.PageSetup.RightMargin = 18
    $i = 0
    foreach ($p in $g.Group | Sort-Object Name) {
      $png = Join-Path $env:TEMP ("yl-scan-" + $p.BaseName + ".png")
      & $edge --headless=new --disable-gpu --user-data-dir="$env:TEMPyl-edge-profile" --no-first-run --hide-scrollbars --window-size=1000,1400 --screenshot="$png" ("file:///" + $p.FullName.Replace("\", "/")) 2>$null | Out-Null
      Start-Sleep -Milliseconds 800
      if ($i -gt 0) { $doc.Content.InsertParagraphAfter(); $r = $doc.Content; $r.Collapse(0); $r.InsertBreak(7) }   # page break
      $r = $doc.Content; $r.Collapse(0)
      $pic = $doc.InlineShapes.AddPicture($png, $false, $true, $r)
      $pic.Width = 560
      $i++
    }
    $doc.SaveAs2((Join-Path $out "$($g.Name).scan.pdf"), 17)
    $doc.Close(0)
    Write-Output "saved $($g.Name) (scan, $i pages)"
  }
} finally {
  $word.Quit()
}

@echo off
rem Refresh the dashboard after replacing "1. SALES FILE\Business Performance Report.xlsx".
rem Reads the Excel file, updates data\ (monthly snapshot, months index, report.json) and pushes it to GitHub (the Pages workflow redeploys).
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%"

python scripts\extract.py || goto :fail

git add data
git diff --cached --quiet && (echo No changes in the data. & goto :done)
for /f %%d in ('python -c "import json;print(json.load(open('data/report.json',encoding='utf-8'))['asOf'])"') do set ASOF=%%d
git commit -m "Data update till %ASOF%" || goto :fail
git push || goto :fail
echo.
echo Pushed. GitHub Pages will publish the new numbers in about 2 minutes:
echo https://kaziradin.github.io/SHWAPNO_SALES_REPORT/
goto :done

:fail
echo.
echo Something went wrong - see the message above.
:done
pause

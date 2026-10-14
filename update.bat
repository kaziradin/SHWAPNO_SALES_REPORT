@echo off
rem Refresh the dashboard after replacing "1. SALES FILE\Business Performance Report.xlsx".
rem Reads the Excel file, updates data\report.json and pushes it to GitHub (Vercel redeploys automatically).
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%"

python scripts\extract.py || goto :fail

git add data\report.json
git diff --cached --quiet && (echo No changes in the data. & goto :done)
for /f %%d in ('python -c "import json;print(json.load(open('data/report.json',encoding='utf-8'))['asOf'])"') do set ASOF=%%d
git commit -m "Data update till %ASOF%" || goto :fail
git push || goto :fail
echo.
echo Pushed. Vercel will publish the new numbers in about a minute.
goto :done

:fail
echo.
echo Something went wrong - see the message above.
:done
pause

@echo off
setlocal EnableExtensions

chcp 65001 >nul
color 0B

title RapidTunes - Lanceur
cd /d "%~dp0"

set "RAPIDTUNES_SCRIPT_NAME=%~nx0"
set "RAPIDTUNES_PORT=1420"
set "RAPIDTUNES_DEBUG_URL=http://localhost:%RAPIDTUNES_PORT%"
set "RAPIDTUNES_HEADER_LINE============================================================"
set "RAPIDTUNES_INTERACTIVE=1"
if not "%~1"=="" set "RAPIDTUNES_INTERACTIVE=0"

if /I "%~1"=="dev" goto :run_project_dev
if /I "%~1"=="user" goto :run_project_user
if /I "%~1"=="web" goto :run_web
if /I "%~1"=="desktop" goto :run_desktop
if /I "%~1"=="build" goto :run_build
if /I "%~1"=="cmd" goto :run_cmd
if /I "%~1"=="diag" goto :run_diag
if /I "%~1"=="help" goto :show_help
if /I "%~1"=="-h" goto :show_help
if /I "%~1"=="/?" goto :show_help
if /I "%~1"=="d" goto :run_project_dev
if /I "%~1"=="u" goto :run_project_user
if /I "%~1"=="w" goto :run_web
if /I "%~1"=="b" goto :run_build
if /I "%~1"=="c" goto :run_cmd
if /I "%~1"=="g" goto :run_diag

if not "%~1"=="" (
  echo [ERREUR] Argument inconnu: %~1
  echo.
  goto :show_help
)

:menu
cls
call :print_section "RapidTunes - Lanceur Windows"
echo.
echo  1^) Lancer le projet (mode développement : .exe + console)
echo  2^) Lancer l'application (mode utilisateur : .exe seul)
echo  3^) Mode web debug (Vite)
echo  4^) Build exécutable (.exe)
echo  5^) Ouvrir une CMD debug (URL localhost)
echo  6^) Diagnostic environnement
echo  7^) Quitter
echo.
echo Raccourcis: D/U/W/B/C/G/Q
set /p RAPIDTUNES_CHOICE=Choisis une option [1-7] : 
echo.

if "%RAPIDTUNES_CHOICE%"=="1" goto :run_project_dev
if "%RAPIDTUNES_CHOICE%"=="2" goto :run_project_user
if "%RAPIDTUNES_CHOICE%"=="3" goto :run_web
if "%RAPIDTUNES_CHOICE%"=="4" goto :run_build
if "%RAPIDTUNES_CHOICE%"=="5" goto :run_cmd
if "%RAPIDTUNES_CHOICE%"=="6" goto :run_diag
if "%RAPIDTUNES_CHOICE%"=="7" goto :quit
if /I "%RAPIDTUNES_CHOICE%"=="D" goto :run_project_dev
if /I "%RAPIDTUNES_CHOICE%"=="U" goto :run_project_user
if /I "%RAPIDTUNES_CHOICE%"=="W" goto :run_web
if /I "%RAPIDTUNES_CHOICE%"=="B" goto :run_build
if /I "%RAPIDTUNES_CHOICE%"=="C" goto :run_cmd
if /I "%RAPIDTUNES_CHOICE%"=="G" goto :run_diag
if /I "%RAPIDTUNES_CHOICE%"=="Q" goto :quit

echo [ERREUR] Choix invalide.
echo.
call :pause_if_interactive
goto :menu

:run_project_dev
call :print_section "RapidTunes - Session développement"
echo.
echo En mode dev : ouverture de la console + fenêtre logiciel.
call :print_debug_urls
call :print_running_style "Passage en mode desktop debug..."
goto :run_desktop

:run_project_user
call :print_section "RapidTunes - Mode utilisateur"
echo.
echo En mode utilisateur : ouverture du .exe uniquement.
echo.

call :find_user_exe
if errorlevel 1 goto :failure

echo [INFO] Lancement de l'exécutable: %RAPIDTUNES_EXE_PATH%
start "" "%RAPIDTUNES_EXE_PATH%"
goto :post_action

:run_cmd
call :print_section "RapidTunes - Ouverture CMD debug"
echo.
echo Une nouvelle invite de commande va s'ouvrir.
call :print_debug_urls
call :print_running_style "Ouverture d'une console debug dédiée..."
start "RapidTunes Debug CMD" cmd /k "cd /d ""%~dp0"" ^& set RAPIDTUNES_NO_AUTO_BROWSER=1 ^& call ""%RAPIDTUNES_SCRIPT_NAME%"" web"
goto :post_action

:run_web
call :print_section "RapidTunes - Mode debug (web)"
echo.
echo Tu peux utiliser cette URL dans le navigateur intégré de VS Code.
call :print_debug_urls
echo.

call :check_npm
if errorlevel 1 goto :failure

call :ensure_node_modules
if errorlevel 1 goto :failure

if defined RAPIDTUNES_NO_AUTO_BROWSER (
  echo [INFO] Ouverture auto du navigateur désactivée.
  echo [INFO] URL de test: %RAPIDTUNES_DEBUG_URL%
) else (
  echo [INFO] Ouverture du lien localhost dans le navigateur système...
  start "" "%RAPIDTUNES_DEBUG_URL%"
)

call :print_running_style "Démarrage du serveur Vite (debug)..."
echo [RUN] Appuie sur Ctrl+C pour arrêter le serveur.
echo.
call npm run dev
echo.
echo [INFO] Serveur arrêté.
goto :post_action

:run_desktop
call :print_section "RapidTunes - Mode desktop natif (Tauri)"
echo.
echo Cette commande lance une vraie fenêtre logiciel (pas un navigateur).
call :print_debug_urls
echo.

call :check_npm
if errorlevel 1 goto :failure

call :check_cargo
if errorlevel 1 goto :failure

call :ensure_node_modules
if errorlevel 1 goto :failure

call :print_running_style "Démarrage de l'application desktop (Tauri)..."
echo [RUN] Appuie sur Ctrl+C pour arrêter.
echo.
call npm run tauri:dev
echo.
echo [INFO] Session desktop terminée.
goto :post_action

:run_build
call :print_section "RapidTunes - Build .exe"
echo.
echo Cette commande génère un exécutable Windows.
echo.

call :check_npm
if errorlevel 1 goto :failure

call :check_cargo
if errorlevel 1 goto :failure

call :ensure_node_modules
if errorlevel 1 goto :failure

call :print_running_style "Compilation desktop en cours..."
call npm run tauri:build
if errorlevel 1 (
  echo [ERREUR] Build Tauri échoue.
  goto :failure
)

echo.
echo [OK] Build terminée.
if not exist "%cd%\release" mkdir "%cd%\release"
copy /Y "%cd%\src-tauri\target\release\rapidtunes.exe" "%cd%\release\RapidTunes.exe" >nul
if errorlevel 1 (
  echo [ERREUR] Impossible de copier rapidtunes.exe.
  goto :failure
)
echo [INFO] Exécutable: %cd%\release\RapidTunes.exe
start "" "%cd%\release\"
goto :post_action

:run_diag
call :print_section "RapidTunes - Diagnostic environnement"
echo.
call :print_debug_urls
echo.
echo [INFO] Vérification des outils:
call :print_cmd_version "Node.js" "node --version"
call :print_cmd_version "npm" "npm --version"
call :print_cmd_version "Cargo" "cargo --version"

echo.
if exist "node_modules" (
  echo [OK]   Dépendances JS: node_modules présent
) else (
  echo [WARN] Dépendances JS: node_modules absent - npm install recommande
)

call :find_user_exe >nul 2>nul
if defined RAPIDTUNES_EXE_PATH (
  echo [OK]   Exécutable détecté: %RAPIDTUNES_EXE_PATH%
) else (
  echo [WARN] Exécutable release introuvable - lance un build
)
echo.
goto :post_action

:print_section
echo %RAPIDTUNES_HEADER_LINE%
echo   %~1
echo   %date% %time:~0,8%
echo %RAPIDTUNES_HEADER_LINE%
exit /b 0

:print_running_style
echo [RUN] %RAPIDTUNES_HEADER_LINE%
echo [RUN] %~1
echo [RUN] %RAPIDTUNES_HEADER_LINE%
exit /b 0

:show_help
echo Usage:
echo   %RAPIDTUNES_SCRIPT_NAME% dev
echo   %RAPIDTUNES_SCRIPT_NAME% user
echo   %RAPIDTUNES_SCRIPT_NAME% web
echo   %RAPIDTUNES_SCRIPT_NAME% desktop
echo   %RAPIDTUNES_SCRIPT_NAME% build
echo   %RAPIDTUNES_SCRIPT_NAME% cmd
echo   %RAPIDTUNES_SCRIPT_NAME% diag
echo.
echo Alias rapides: d u w b c g
echo Sans argument, un menu interactif est affiché.
goto :eof

:print_debug_urls
set "RAPIDTUNES_HOST_IP="
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R /C:"IPv4"') do (
  set "RAPIDTUNES_HOST_IP=%%I"
  goto :print_debug_urls_ip_found
)

:print_debug_urls_ip_found
if defined RAPIDTUNES_HOST_IP set "RAPIDTUNES_HOST_IP=%RAPIDTUNES_HOST_IP: =%"

echo [INFO] URL locale (debug)         : %RAPIDTUNES_DEBUG_URL%
if defined RAPIDTUNES_HOST_IP echo [INFO] URL réseau (debug)         : http://%RAPIDTUNES_HOST_IP%:%RAPIDTUNES_PORT%
if not defined RAPIDTUNES_HOST_IP echo [INFO] URL réseau (debug)         : non détectée automatiquement
echo [INFO] URL cible fenêtre Tauri    : %RAPIDTUNES_DEBUG_URL%
exit /b 0

:print_cmd_version
set "RAPIDTUNES_TOOL_VERSION="
for /f "delims=" %%V in ('%~2 2^>nul') do (
  set "RAPIDTUNES_TOOL_VERSION=%%V"
  goto :print_cmd_version_done
)

:print_cmd_version_done
if defined RAPIDTUNES_TOOL_VERSION echo [OK]   %~1 : %RAPIDTUNES_TOOL_VERSION%
if not defined RAPIDTUNES_TOOL_VERSION echo [WARN] %~1 : introuvable
exit /b 0

:find_user_exe
set "RAPIDTUNES_EXE_PATH="

if exist "%cd%\src-tauri\target\release\RapidTunes.exe" (
  set "RAPIDTUNES_EXE_PATH=%cd%\src-tauri\target\release\RapidTunes.exe"
)

if not defined RAPIDTUNES_EXE_PATH if exist "%cd%\src-tauri\target\release\rapidtunes.exe" (
  set "RAPIDTUNES_EXE_PATH=%cd%\src-tauri\target\release\rapidtunes.exe"
)

if not defined RAPIDTUNES_EXE_PATH (
  for /f "delims=" %%F in ('dir /b /s "%cd%\src-tauri\target\release\bundle\*.exe" 2^>nul') do (
    set "RAPIDTUNES_EXE_PATH=%%F"
    goto :find_user_exe_done
  )
)

:find_user_exe_done
if defined RAPIDTUNES_EXE_PATH exit /b 0

echo [ERREUR] Aucun exécutable utilisateur trouvé.
echo [INFO] Lance d'abord un build: %RAPIDTUNES_SCRIPT_NAME% build
exit /b 1

:check_npm
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] npm est introuvable. Installe Node.js puis réessaie.
  exit /b 1
)
exit /b 0

:check_cargo
where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Rust/Cargo est introuvable. Installe Rust puis réessaie.
  exit /b 1
)
exit /b 0

:ensure_node_modules
if not exist "node_modules" (
  echo [INFO] node_modules introuvable, installation des dépendances JS...
  call npm install
  if errorlevel 1 (
    echo [ERREUR] Échec pendant npm install.
    exit /b 1
  )
)
exit /b 0

:pause_if_interactive
if "%RAPIDTUNES_INTERACTIVE%"=="1" pause
exit /b 0

:post_action
if "%RAPIDTUNES_INTERACTIVE%"=="1" (
  echo.
  echo [INFO] Appuie sur une touche pour revenir au menu...
  pause >nul
  goto :menu
)
goto :eof

:failure
if "%RAPIDTUNES_INTERACTIVE%"=="1" (
  echo.
  echo [ERREUR] Action interrompue.
  call :pause_if_interactive
  goto :menu
)
exit /b 1

:quit
echo.
echo [INFO] Fermeture du lanceur.
goto :eof

:eof
endlocal
exit /b 0
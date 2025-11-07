@echo off
REM Batch script untuk membersihkan file-file yang tidak relevan untuk deployment Vercel

echo Membersihkan file-file yang tidak relevan untuk deployment Vercel...

REM File-file yang tidak relevan untuk Vercel deployment
set "files_to_remove=build.sh deploy.sh install.sh setup.sh start-all.sh start-services.sh stop-services.sh optimize-vps.sh Dockerfile Dockerfile.optimized docker-compose.yml docker-compose.optimized.yml nixpacks.toml railway.json .node-version dev_server.log frontend_server.log server.log error.md generate_hash.js generate_hash.mjs insert_admin.sql insert_admin_correct.sql insert_admin_final.sql insert_admin_user.sql"

REM Hapus file-file yang ditentukan
for %%f in (%files_to_remove%) do (
    if exist "%%f" (
        echo Menghapus %%f
        del "%%f"
    )
)

REM Hapus folder-folder yang tidak relevan
if exist "wa_credentials" (
    echo Menghapus folder wa_credentials
    rmdir /s /q wa_credentials
)

if exist "media" (
    echo Menghapus folder media
    rmdir /s /q media
)

if exist "dist" (
    echo Menghapus folder dist
    rmdir /s /q dist
)

echo Pembersihan selesai!
pause
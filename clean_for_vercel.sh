#!/bin/bash
# Skrip membersihkan file-file yang tidak relevan untuk deployment Vercel

echo "Membersihkan file-file yang tidak relevan untuk deployment Vercel..."

# File-file yang tidak relevan untuk Vercel deployment
files_to_remove=(
    "build.sh"
    "deploy.sh" 
    "install.sh"
    "setup.sh"
    "start-all.sh"
    "start-services.sh"
    "stop-services.sh"
    "optimize-vps.sh"
    "Dockerfile"
    "Dockerfile.optimized"
    "docker-compose.yml"
    "docker-compose.optimized.yml"
    "nixpacks.toml"
    "railway.json"
    ".node-version"
    "dev_server.log"
    "frontend_server.log"
    "server.log"
    "error.md"
    "generate_hash.js"
    "generate_hash.mjs"
    "insert_admin.sql"
    "insert_admin_correct.sql"
    "insert_admin_final.sql"
    "insert_admin_user.sql"
)

for file in "${files_to_remove[@]}"; do
    if [ -f "$file" ] || [ -d "$file" ]; then
        echo "Menghapus $file"
        rm -rf "$file"
    fi
done

# Hapus juga folder yang tidak relevan
folders_to_remove=(
    "wa_credentials"
    "media"
    "dist"
)

for folder in "${folders_to_remove[@]}"; do
    if [ -d "$folder" ]; then
        echo "Menghapus folder $folder"
        rm -rf "$folder"
    fi
done

echo "Pembersihan selesai!"
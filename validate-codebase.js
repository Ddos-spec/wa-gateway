#!/usr/bin/env node
/**
 * Comprehensive Codebase Validation Script
 *
 * This script validates:
 * - File imports and dependencies
 * - API route consistency
 * - Environment variables
 * - File path existence
 * - Potential bugs and issues
 *
 * Run: node validate-codebase.js
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

class CodebaseValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.info = [];
        this.rootDir = __dirname;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = {
            error: `${colors.red}${colors.bold}[ERROR]${colors.reset}`,
            warning: `${colors.yellow}[WARN]${colors.reset}`,
            success: `${colors.green}[OK]${colors.reset}`,
            info: `${colors.cyan}[INFO]${colors.reset}`
        }[type];

        console.log(`${prefix} ${message}`);

        if (type === 'error') this.errors.push(message);
        else if (type === 'warning') this.warnings.push(message);
        else this.info.push(message);
    }

    // ==========================================
    // 1. FILE EXISTENCE VALIDATION
    // ==========================================

    validateFileExists(filePath, description) {
        const fullPath = path.join(this.rootDir, filePath);
        if (!fs.existsSync(fullPath)) {
            this.log(`Missing file: ${filePath} (${description})`, 'error');
            return false;
        }
        return true;
    }

    checkCriticalFiles() {
        this.log(`\n${colors.bold}=== Checking Critical Files ===${colors.reset}`);

        const criticalFiles = [
            { path: 'index.js', desc: 'Main entry point' },
            { path: 'api_v2.js', desc: 'API v2 routes' },
            { path: 'phone-pairing.js', desc: 'Phone pairing logic' },
            { path: 'src/session/session-manager.js', desc: 'Session manager' },
            { path: 'src/connection/socket-manager.js', desc: 'Socket manager' },
            { path: 'src/connection/connection-handler.js', desc: 'Connection handler' },
            { path: 'src/services/message-service.js', desc: 'Message service' },
            { path: 'src/webhooks/webhook-handler.js', desc: 'Webhook handler' },
            { path: 'config/baileys.config.js', desc: 'Baileys configuration' },
            { path: 'package.json', desc: 'Package manifest' },
            { path: '.env.example', desc: 'Environment example' }
        ];

        let allExist = true;
        criticalFiles.forEach(file => {
            if (this.validateFileExists(file.path, file.desc)) {
                this.log(`✓ ${file.path}`, 'success');
            } else {
                allExist = false;
            }
        });

        return allExist;
    }

    // ==========================================
    // 2. IMPORT VALIDATION
    // ==========================================

    extractRequires(filePath) {
        const fullPath = path.join(this.rootDir, filePath);
        if (!fs.existsSync(fullPath)) return [];

        const content = fs.readFileSync(fullPath, 'utf8');
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        const requires = [];
        let match;

        while ((match = requireRegex.exec(content)) !== null) {
            requires.push(match[1]);
        }

        return requires;
    }

    validateImports() {
        this.log(`\n${colors.bold}=== Validating Imports ===${colors.reset}`);

        const filesToCheck = [
            'index.js',
            'api_v2.js',
            'src/session/session-manager.js',
            'src/connection/socket-manager.js',
            'src/connection/connection-handler.js'
        ];

        filesToCheck.forEach(file => {
            const requires = this.extractRequires(file);
            this.log(`Checking ${file}...`, 'info');

            requires.forEach(req => {
                // Skip node_modules
                if (!req.startsWith('.') && !req.startsWith('/')) return;

                // Resolve relative path
                const fileDir = path.dirname(path.join(this.rootDir, file));
                let resolvedPath = path.resolve(fileDir, req);

                // Try with .js extension if not present
                if (!resolvedPath.endsWith('.js') && !fs.existsSync(resolvedPath)) {
                    resolvedPath += '.js';
                }

                if (!fs.existsSync(resolvedPath)) {
                    this.log(`  ✗ Missing import in ${file}: ${req}`, 'error');
                } else {
                    this.log(`  ✓ ${req}`, 'success');
                }
            });
        });
    }

    // ==========================================
    // 3. API ROUTE VALIDATION
    // ==========================================

    validateApiRoutes() {
        this.log(`\n${colors.bold}=== Validating API Routes ===${colors.reset}`);

        const apiFile = path.join(this.rootDir, 'api_v2.js');
        if (!fs.existsSync(apiFile)) {
            this.log('API file not found!', 'error');
            return;
        }

        const content = fs.readFileSync(apiFile, 'utf8');

        // Extract all routes
        const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/g;
        const routes = [];
        let match;

        while ((match = routeRegex.exec(content)) !== null) {
            routes.push({
                method: match[1].toUpperCase(),
                path: match[2]
            });
        }

        this.log(`Found ${routes.length} routes:`, 'info');
        routes.forEach(route => {
            this.log(`  ${route.method.padEnd(7)} /api/v2${route.path}`, 'success');
        });

        // Check for duplicate routes
        const routeKeys = routes.map(r => `${r.method}:${r.path}`);
        const duplicates = routeKeys.filter((item, index) => routeKeys.indexOf(item) !== index);

        if (duplicates.length > 0) {
            duplicates.forEach(dup => {
                this.log(`Duplicate route found: ${dup}`, 'warning');
            });
        } else {
            this.log('No duplicate routes found', 'success');
        }
    }

    // ==========================================
    // 4. ENVIRONMENT VARIABLE VALIDATION
    // ==========================================

    validateEnvironmentVariables() {
        this.log(`\n${colors.bold}=== Validating Environment Variables ===${colors.reset}`);

        const envExample = path.join(this.rootDir, '.env.example');
        const envFile = path.join(this.rootDir, '.env');

        if (!fs.existsSync(envExample)) {
            this.log('.env.example not found', 'warning');
            return;
        }

        const exampleContent = fs.readFileSync(envExample, 'utf8');
        const requiredVars = exampleContent
            .split('\n')
            .filter(line => line && !line.startsWith('#'))
            .map(line => line.split('=')[0].trim())
            .filter(v => v);

        this.log(`Required environment variables from .env.example:`, 'info');

        if (fs.existsSync(envFile)) {
            const envContent = fs.readFileSync(envFile, 'utf8');
            const setVars = envContent
                .split('\n')
                .filter(line => line && !line.startsWith('#'))
                .map(line => line.split('=')[0].trim());

            requiredVars.forEach(varName => {
                if (setVars.includes(varName)) {
                    this.log(`  ✓ ${varName}`, 'success');
                } else {
                    this.log(`  ✗ ${varName} - Not set in .env`, 'warning');
                }
            });
        } else {
            this.log('.env file not found! Using environment variables or defaults.', 'warning');
            requiredVars.forEach(varName => {
                if (process.env[varName]) {
                    this.log(`  ✓ ${varName} - Set via environment`, 'success');
                } else {
                    this.log(`  ? ${varName} - Not found`, 'warning');
                }
            });
        }
    }

    // ==========================================
    // 5. CODE QUALITY CHECKS
    // ==========================================

    checkCodeQuality() {
        this.log(`\n${colors.bold}=== Code Quality Checks ===${colors.reset}`);

        const filesToCheck = [
            'src/connection/socket-manager.js',
            'src/connection/connection-handler.js',
            'src/session/session-manager.js'
        ];

        filesToCheck.forEach(file => {
            const fullPath = path.join(this.rootDir, file);
            if (!fs.existsSync(fullPath)) return;

            const content = fs.readFileSync(fullPath, 'utf8');

            // Check for console.log (should use logger)
            if (content.includes('console.log') && !file.includes('validate-codebase')) {
                this.log(`${file}: Found console.log (use logger instead)`, 'warning');
            }

            // Check for TODO/FIXME comments
            const todoMatches = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)/gi);
            if (todoMatches) {
                this.log(`${file}: Found ${todoMatches.length} TODO/FIXME comments`, 'info');
            }

            // Check for proper error handling
            const tryBlocks = (content.match(/try\s*{/g) || []).length;
            const catchBlocks = (content.match(/catch\s*\(/g) || []).length;

            if (tryBlocks !== catchBlocks) {
                this.log(`${file}: Mismatched try/catch blocks (${tryBlocks} try, ${catchBlocks} catch)`, 'warning');
            }
        });
    }

    // ==========================================
    // 6. PAIRING CODE LOGIC VALIDATION
    // ==========================================

    validatePairingLogic() {
        this.log(`\n${colors.bold}=== Validating Pairing Code Logic ===${colors.reset}`);

        const socketManager = path.join(this.rootDir, 'src/connection/socket-manager.js');
        const connectionHandler = path.join(this.rootDir, 'src/connection/connection-handler.js');

        if (!fs.existsSync(socketManager) || !fs.existsSync(connectionHandler)) {
            this.log('Required files not found for pairing logic check', 'error');
            return;
        }

        const smContent = fs.readFileSync(socketManager, 'utf8');
        const chContent = fs.readFileSync(connectionHandler, 'utf8');

        // Check for duplicate prevention
        if (smContent.includes('pairingCodeRequested') && smContent.includes('pairingCodeTimestamp')) {
            this.log('✓ Duplicate prevention implemented in SocketManager', 'success');
        } else {
            this.log('✗ Duplicate prevention NOT found in SocketManager', 'error');
        }

        // Check for requestPairingCode method
        if (smContent.includes('async requestPairingCode()')) {
            this.log('✓ requestPairingCode method found', 'success');
        } else {
            this.log('✗ requestPairingCode method NOT found', 'error');
        }

        // Check if ConnectionHandler has duplicate flag (should NOT have)
        if (chContent.includes('this.pairingCodeRequested')) {
            this.log('⚠ ConnectionHandler still has pairingCodeRequested flag (should be centralized in SocketManager)', 'warning');
        } else {
            this.log('✓ Pairing code logic properly centralized', 'success');
        }

        // Check Baileys config
        const baileysConfig = path.join(this.rootDir, 'config/baileys.config.js');
        if (fs.existsSync(baileysConfig)) {
            const configContent = fs.readFileSync(baileysConfig, 'utf8');

            if (configContent.includes('qrTimeout: 60000')) {
                this.log('✓ qrTimeout set to 60 seconds', 'success');
            } else {
                this.log('⚠ qrTimeout might not be optimized', 'warning');
            }

            if (configContent.includes('mobile: false')) {
                this.log('✓ Using Web API for pairing', 'success');
            } else {
                this.log('⚠ mobile API setting not explicitly set', 'warning');
            }
        }
    }

    // ==========================================
    // 7. PACKAGE.JSON VALIDATION
    // ==========================================

    validatePackageJson() {
        this.log(`\n${colors.bold}=== Validating package.json ===${colors.reset}`);

        const pkgPath = path.join(this.rootDir, 'package.json');
        if (!fs.existsSync(pkgPath)) {
            this.log('package.json not found!', 'error');
            return;
        }

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        const requiredDeps = [
            '@whiskeysockets/baileys',
            'express',
            'ws',
            { name: 'redis', alternatives: ['redis', 'ioredis'] },
            'pino',
            'dotenv'
        ];

        this.log('Checking required dependencies:', 'info');
        requiredDeps.forEach(dep => {
            const depName = typeof dep === 'string' ? dep : dep.name;
            const alternatives = typeof dep === 'object' ? dep.alternatives : [dep];

            let found = false;
            let foundVersion = null;
            let foundName = null;

            // Check all alternatives
            for (const alt of alternatives) {
                if (pkg.dependencies && pkg.dependencies[alt]) {
                    found = true;
                    foundVersion = pkg.dependencies[alt];
                    foundName = alt;
                    break;
                } else if (pkg.devDependencies && pkg.devDependencies[alt]) {
                    found = true;
                    foundVersion = `dev: ${pkg.devDependencies[alt]}`;
                    foundName = alt;
                    break;
                }
            }

            if (found) {
                const displayName = foundName === depName ? depName : `${depName} (using ${foundName})`;
                this.log(`  ✓ ${displayName} (${foundVersion})`, 'success');
            } else {
                this.log(`  ✗ ${depName} - NOT FOUND`, 'error');
            }
        });
    }

    // ==========================================
    // MAIN VALIDATION RUNNER
    // ==========================================

    async run() {
        console.log(`\n${colors.bold}${colors.blue}╔════════════════════════════════════════════════════╗${colors.reset}`);
        console.log(`${colors.bold}${colors.blue}║   WA-GATEWAY CODEBASE VALIDATION                  ║${colors.reset}`);
        console.log(`${colors.bold}${colors.blue}╚════════════════════════════════════════════════════╝${colors.reset}\n`);

        try {
            this.checkCriticalFiles();
            this.validateImports();
            this.validateApiRoutes();
            this.validateEnvironmentVariables();
            this.checkCodeQuality();
            this.validatePairingLogic();
            this.validatePackageJson();

            // Summary
            console.log(`\n${colors.bold}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
            console.log(`${colors.bold}VALIDATION SUMMARY${colors.reset}`);
            console.log(`${colors.bold}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}\n`);

            console.log(`${colors.red}${colors.bold}Errors:   ${this.errors.length}${colors.reset}`);
            console.log(`${colors.yellow}Warnings: ${this.warnings.length}${colors.reset}`);
            console.log(`${colors.cyan}Info:     ${this.info.length}${colors.reset}\n`);

            if (this.errors.length === 0) {
                console.log(`${colors.green}${colors.bold}✓ VALIDATION PASSED!${colors.reset}`);
                console.log(`${colors.green}No critical errors found. Your codebase looks good!${colors.reset}\n`);
                process.exit(0);
            } else {
                console.log(`${colors.red}${colors.bold}✗ VALIDATION FAILED!${colors.reset}`);
                console.log(`${colors.red}Please fix the errors above before deploying.${colors.reset}\n`);
                process.exit(1);
            }

        } catch (error) {
            console.error(`\n${colors.red}${colors.bold}VALIDATION ERROR:${colors.reset}`, error.message);
            console.error(error.stack);
            process.exit(1);
        }
    }
}

// Run validation
const validator = new CodebaseValidator();
validator.run();

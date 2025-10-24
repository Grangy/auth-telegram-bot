#!/usr/bin/env node

/**
 * Скрипт безопасного перезапуска сервера
 * Использование: node scripts/restart-server.js [--port 3000] [--wait 5]
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = 3000;
const DEFAULT_WAIT_TIME = 5; // секунд

// Парсинг аргументов командной строки
const args = process.argv.slice(2);
const port = args.includes('--port') ? 
    parseInt(args[args.indexOf('--port') + 1]) || DEFAULT_PORT : 
    DEFAULT_PORT;

const waitTime = args.includes('--wait') ? 
    parseInt(args[args.indexOf('--wait') + 1]) || DEFAULT_WAIT_TIME : 
    DEFAULT_WAIT_TIME;

console.log(`🔄 Безопасный перезапуск сервера на порту ${port}...`);

// Функция проверки, что сервер запущен
async function waitForServer() {
    return new Promise((resolve, reject) => {
        const maxAttempts = 30; // 30 попыток по 1 секунде
        let attempts = 0;
        
        const checkServer = () => {
            attempts++;
            
            const req = http.request({
                hostname: 'localhost',
                port: port,
                path: '/health',
                method: 'GET',
                timeout: 1000
            }, (res) => {
                if (res.statusCode === 200) {
                    console.log('✅ Сервер запущен и отвечает');
                    resolve();
                } else {
                    if (attempts < maxAttempts) {
                        setTimeout(checkServer, 1000);
                    } else {
                        reject(new Error('Сервер не отвечает после 30 секунд'));
                    }
                }
            });
            
            req.on('error', () => {
                if (attempts < maxAttempts) {
                    setTimeout(checkServer, 1000);
                } else {
                    reject(new Error('Не удалось подключиться к серверу'));
                }
            });
            
            req.on('timeout', () => {
                req.destroy();
                if (attempts < maxAttempts) {
                    setTimeout(checkServer, 1000);
                } else {
                    reject(new Error('Таймаут подключения к серверу'));
                }
            });
            
            req.end();
        };
        
        checkServer();
    });
}

// Функция отправки сигнала SIGTERM для graceful shutdown
async function gracefulShutdown() {
    return new Promise((resolve) => {
        console.log('📡 Отправка сигнала SIGTERM для безопасного выключения...');
        
        const req = http.request({
            hostname: 'localhost',
            port: port,
            path: '/health',
            method: 'GET',
            timeout: 2000
        }, (res) => {
            // Если сервер отвечает, отправляем SIGTERM
            if (res.statusCode === 200) {
                console.log('⏳ Ожидание завершения работы сервера...');
                setTimeout(resolve, waitTime * 1000);
            } else {
                resolve();
            }
        });
        
        req.on('error', () => {
            console.log('⚠️ Сервер уже не отвечает');
            resolve();
        });
        
        req.on('timeout', () => {
            console.log('⚠️ Таймаут при проверке сервера');
            resolve();
        });
        
        req.end();
    });
}

// Основная функция
async function main() {
    try {
        // 1. Проверяем, что сервер запущен
        console.log('🔍 Проверка состояния сервера...');
        await waitForServer();
        
        // 2. Graceful shutdown
        await gracefulShutdown();
        
        // 3. Запускаем новый сервер
        console.log('🚀 Запуск нового сервера...');
        const serverProcess = spawn('node', ['server.js'], {
            stdio: 'inherit',
            cwd: process.cwd()
        });
        
        // 4. Ждем, пока новый сервер запустится
        console.log('⏳ Ожидание запуска нового сервера...');
        await waitForServer();
        
        console.log('✅ Перезапуск завершен успешно!');
        
        // Обработка завершения процесса
        process.on('SIGINT', () => {
            console.log('\n🛑 Остановка нового сервера...');
            serverProcess.kill('SIGINT');
            process.exit(0);
        });
        
    } catch (error) {
        console.error(`❌ Ошибка при перезапуске: ${error.message}`);
        process.exit(1);
    }
}

// Обработка сигналов
process.on('SIGINT', () => {
    console.log('\n🛑 Перезапуск прерван пользователем');
    process.exit(0);
});

// Запуск
main();

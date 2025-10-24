#!/usr/bin/env node

/**
 * Скрипт проверки здоровья сервера
 * Использование: node scripts/health-check.js [--port 3000]
 */

const http = require('http');
const { URL } = require('url');

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = 'localhost';

// Парсинг аргументов командной строки
const args = process.argv.slice(2);
const port = args.includes('--port') ? 
    parseInt(args[args.indexOf('--port') + 1]) || DEFAULT_PORT : 
    DEFAULT_PORT;

const host = args.includes('--host') ? 
    args[args.indexOf('--host') + 1] : 
    DEFAULT_HOST;

console.log(`🔍 Проверка здоровья сервера на ${host}:${port}...`);

// Функция проверки здоровья
async function checkHealth() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            port: port,
            path: '/health',
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const health = JSON.parse(data);
                    resolve({
                        status: res.statusCode,
                        health: health,
                        responseTime: Date.now() - startTime
                    });
                } catch (error) {
                    reject(new Error(`Ошибка парсинга ответа: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Ошибка подключения: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Таймаут подключения (5 секунд)'));
        });

        const startTime = Date.now();
        req.end();
    });
}

// Основная функция
async function main() {
    try {
        const result = await checkHealth();
        
        console.log(`✅ Сервер отвечает (${result.responseTime}ms)`);
        console.log(`📊 Статус: ${result.status}`);
        console.log(`⏰ Время работы: ${Math.floor(result.health.uptime)} секунд`);
        
        // Проверяем состояние сервисов
        const services = result.health.services;
        console.log('\n🔧 Состояние сервисов:');
        console.log(`   📊 База данных: ${services.database ? '✅' : '❌'}`);
        console.log(`   🧠 Кэш: ${services.cache ? '✅' : '❌'}`);
        console.log(`   🤖 Telegram: ${services.telegram ? '✅' : '❌'}`);
        
        // Определяем общий статус
        const allServicesOk = Object.values(services).every(status => status);
        
        if (result.status === 200 && allServicesOk) {
            console.log('\n🎉 Все системы работают корректно!');
            process.exit(0);
        } else {
            console.log('\n⚠️ Обнаружены проблемы с сервисами');
            process.exit(1);
        }
        
    } catch (error) {
        console.error(`❌ Ошибка проверки здоровья: ${error.message}`);
        process.exit(1);
    }
}

// Обработка сигналов
process.on('SIGINT', () => {
    console.log('\n🛑 Проверка прервана пользователем');
    process.exit(0);
});

// Запуск
main();

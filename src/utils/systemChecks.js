const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');
const config = require('../config/config');

class SystemChecks {
    constructor() {
        this.prisma = null;
    }

    // Проверка переменных окружения
    async checkEnvironmentVariables() {
        const requiredVars = [
            'DATABASE_URL',
            'TELEGRAM_BOT_TOKEN',
            'BOT_USERNAME'
        ];

        const missing = requiredVars.filter(varName => !process.env[varName]);
        
        if (missing.length > 0) {
            throw new Error(`Отсутствуют обязательные переменные окружения: ${missing.join(', ')}`);
        }

        // Проверяем формат DATABASE_URL
        if (!process.env.DATABASE_URL.startsWith('mongodb')) {
            throw new Error('DATABASE_URL должен быть MongoDB URL');
        }

        // Проверяем, что это не тестовый URL
        if (process.env.DATABASE_URL.includes('username:password')) {
            throw new Error('DATABASE_URL содержит тестовые данные. Настройте реальное подключение к MongoDB.');
        }

        return {
            message: 'Переменные окружения настроены корректно',
            details: `Найдено ${requiredVars.length} переменных`
        };
    }

    // Проверка подключения к базе данных
    async checkDatabaseConnection() {
        try {
            this.prisma = new PrismaClient();
            await this.prisma.$connect();
            
            // Проверяем базовые операции
            const userCount = await this.prisma.user.count();
            const sessionCount = await this.prisma.session.count();
            
            return {
                message: 'Подключение к базе данных установлено',
                details: `Пользователи: ${userCount}, Сессии: ${sessionCount}`
            };
        } catch (error) {
            throw new Error(`Ошибка подключения к БД: ${error.message}`);
        }
    }

    // Проверка структуры базы данных
    async checkDatabaseSchema() {
        if (!this.prisma) {
            throw new Error('База данных не подключена');
        }

        try {
            // Проверяем существование всех таблиц через простые запросы
            const collections = [
                'user', 'session', 'authKey', 'smsCode', 
                'longTermSession', 'cacheEntry'
            ];

            const results = {};
            for (const collection of collections) {
                try {
                    const count = await this.prisma[collection].count();
                    results[collection] = count;
                } catch (error) {
                    throw new Error(`Таблица ${collection} недоступна: ${error.message}`);
                }
            }

            return {
                message: 'Структура базы данных корректна',
                details: `Проверено ${collections.length} таблиц`
            };
        } catch (error) {
            throw new Error(`Ошибка проверки структуры БД: ${error.message}`);
        }
    }

    // Проверка кэша (in-memory)
    async checkCacheConnection() {
        try {
            // In-memory кэш всегда доступен
            return {
                message: 'In-memory кэш активен',
                details: 'Кэш работает в памяти приложения'
            };
        } catch (error) {
            throw new Error(`Ошибка инициализации кэша: ${error.message}`);
        }
    }

    // Проверка Telegram бота
    async checkTelegramBot() {
        try {
            const TelegramBot = require('node-telegram-bot-api');
            const bot = new TelegramBot(config.botToken, { polling: false });
            
            // Получаем информацию о боте
            const botInfo = await bot.getMe();
            
            if (!botInfo || !botInfo.id) {
                throw new Error('Не удалось получить информацию о боте');
            }

            return {
                message: 'Telegram бот настроен корректно',
                details: `Бот: @${botInfo.username} (ID: ${botInfo.id})`
            };
        } catch (error) {
            throw new Error(`Ошибка настройки Telegram бота: ${error.message}`);
        }
    }

    // Проверка файловой системы
    async checkFileSystem() {
        const fs = require('fs').promises;
        const path = require('path');

        try {
            // Проверяем директории
            const requiredDirs = [
                'logs',
                'logs/backups',
                'public',
                'src'
            ];

            for (const dir of requiredDirs) {
                try {
                    await fs.access(dir);
                } catch {
                    await fs.mkdir(dir, { recursive: true });
                }
            }

            // Проверяем права на запись
            const testFile = path.join('logs', 'test-write.tmp');
            await fs.writeFile(testFile, 'test');
            await fs.unlink(testFile);

            return {
                message: 'Файловая система готова',
                details: `Проверено ${requiredDirs.length} директорий`
            };
        } catch (error) {
            throw new Error(`Ошибка файловой системы: ${error.message}`);
        }
    }

    // Проверка портов
    async checkPorts() {
        const net = require('net');
        
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            
            server.listen(config.port, (error) => {
                if (error) {
                    reject(new Error(`Порт ${config.port} недоступен: ${error.message}`));
                } else {
                    server.close(() => {
                        resolve({
                            message: `Порт ${config.port} доступен`,
                            details: 'Сервер может быть запущен'
                        });
                    });
                }
            });
            
            server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    reject(new Error(`Порт ${config.port} уже используется`));
                } else {
                    reject(new Error(`Ошибка порта: ${error.message}`));
                }
            });
        });
    }

    // Проверка зависимостей
    async checkDependencies() {
        try {
            const packageJson = require('../../package.json');
            const requiredDeps = [
                'express', 'socket.io', 'prisma', '@prisma/client',
                'node-telegram-bot-api', 'qrcode', 'uuid', 'winston'
            ];

            const missing = requiredDeps.filter(dep => !packageJson.dependencies[dep]);
            
            if (missing.length > 0) {
                throw new Error(`Отсутствуют зависимости: ${missing.join(', ')}`);
            }

            return {
                message: 'Все зависимости установлены',
                details: `Проверено ${requiredDeps.length} пакетов`
            };
        } catch (error) {
            throw new Error(`Ошибка проверки зависимостей: ${error.message}`);
        }
    }

    // Очистка ресурсов
    async cleanup() {
        if (this.prisma) {
            await this.prisma.$disconnect();
        }
    }
}

module.exports = SystemChecks;

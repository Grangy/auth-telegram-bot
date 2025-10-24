const Redis = require('ioredis');
const config = require('./config');

class RedisService {
    constructor() {
        this.isConnected = false;
        this.fallbackCache = new Map(); // In-memory fallback
        this.retryCount = 0;
        this.maxRetries = 5;
        
        // ВРЕМЕННО: Полностью отключаем Redis на деплое
        // TODO: Включить Redis когда настроим Redis Cloud
        console.log('⚠️ Redis временно отключен, используем только fallback кэш');
        this.isConnected = false;
        
        // Закомментировано до настройки Redis Cloud
        /*
        if (process.env.REDIS_URL || (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost')) {
            this.setupErrorHandling();
            this.initializeRedis();
        } else {
            console.log('⚠️ Redis не настроен, используем только fallback кэш');
            this.isConnected = false;
        }
        */
    }

    setupErrorHandling() {
        // Полностью подавляем unhandled error events от ioredis
        const originalEmit = process.emit;
        process.emit = function(event, ...args) {
            // Подавляем ВСЕ ошибки Redis
            if (event === 'unhandledRejection' && args[0]) {
                const error = args[0];
                if (error.message && (
                    error.message.includes('ECONNREFUSED') ||
                    error.message.includes('Redis') ||
                    error.message.includes('ioredis') ||
                    error.message.includes('max retries') ||
                    error.message.includes('AggregateError')
                )) {
                    // Полностью подавляем, не логируем
                    return false;
                }
            }
            return originalEmit.apply(this, arguments);
        };

        // Подавляем все uncaughtException для Redis
        process.on('uncaughtException', (error) => {
            if (error.message && (
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('Redis') ||
                error.message.includes('ioredis') ||
                error.message.includes('max retries') ||
                error.message.includes('AggregateError')
            )) {
                // Полностью подавляем
                return;
            }
            // Для других ошибок используем стандартную обработку
            console.error('Uncaught Exception:', error);
        });

        // Дополнительно подавляем все события ошибок от ioredis
        process.on('unhandledRejection', (reason, promise) => {
            if (reason && reason.message && (
                reason.message.includes('ECONNREFUSED') ||
                reason.message.includes('Redis') ||
                reason.message.includes('ioredis') ||
                reason.message.includes('max retries') ||
                reason.message.includes('AggregateError')
            )) {
                // Полностью подавляем
                return;
            }
            // Для других ошибок используем стандартную обработку
            console.error('Unhandled Rejection:', reason);
        });
    }

    initializeRedis() {
        // Если Redis не настроен, не пытаемся подключаться
        if (!process.env.REDIS_URL && (!process.env.REDIS_HOST || process.env.REDIS_HOST === 'localhost')) {
            console.log('⚠️ Redis не настроен, используем только fallback кэш');
            this.isConnected = false;
            return;
        }

        try {
            // Поддержка REDIS_URL для внешних сервисов (Render, Redis Cloud)
            const redisConfig = process.env.REDIS_URL 
                ? { url: process.env.REDIS_URL }
                : {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT || 6379,
                    password: process.env.REDIS_PASSWORD || undefined
                };

            this.client = new Redis({
                ...redisConfig,
                // Полностью отключаем все попытки переподключения
                lazyConnect: true,
                connectTimeout: 2000,
                commandTimeout: 2000,
                retryDelayOnFailover: 0,
                maxRetriesPerRequest: 0,
                retryDelayOnClusterDown: 0,
                enableReadyCheck: false,
                enableAutoPipelining: false,
                enableOfflineQueue: false,
                // Отключаем все retry механизмы
                retryDelayOnFailover: 0,
                maxRetriesPerRequest: 0,
                // Отключаем автоматическое переподключение
                autoResubscribe: false,
                autoResendUnfulfilledCommands: false
            });

            this.client.on('connect', () => {
                console.log('✅ Redis подключен');
                this.isConnected = true;
                this.retryCount = 0;
            });

            this.client.on('ready', () => {
                console.log('✅ Redis готов к работе');
                this.isConnected = true;
            });

            this.client.on('error', (error) => {
                // Полностью подавляем все ошибки Redis
                if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
                    console.warn('⚠️ Redis недоступен, используем fallback кэш');
                    this.isConnected = false;
                    return;
                }
                
                // Для других ошибок тоже используем fallback
                console.warn('⚠️ Ошибка Redis (используем fallback):', error.message);
                this.isConnected = false;
            });

            this.client.on('close', () => {
                console.warn('⚠️ Соединение с Redis закрыто');
                this.isConnected = false;
            });

            this.client.on('reconnecting', () => {
                console.log('🔄 Переподключение к Redis...');
                this.retryCount++;
            });

        } catch (error) {
            console.warn('⚠️ Не удалось инициализировать Redis, используем fallback:', error.message);
            this.isConnected = false;
        }
    }

    handleRedisError(error) {
        // Полностью отключаем переподключение для ошибок подключения
        if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
            console.warn('⚠️ Redis недоступен, используем fallback кэш. Переподключение отключено.');
            this.isConnected = false;
            return;
        }

        // Для других ошибок тоже не переподключаемся
        console.warn('⚠️ Redis ошибка, используем fallback кэш. Переподключение отключено.');
        this.isConnected = false;
    }

    async get(key) {
        // Всегда используем fallback кэш
        const fallbackValue = this.fallbackCache.get(key);
        if (fallbackValue && fallbackValue.expiresAt > Date.now()) {
            return fallbackValue.data;
        } else if (fallbackValue) {
            this.fallbackCache.delete(key);
        }
        return null;
    }

    async set(key, value, ttl = 3600) {
        // Всегда используем fallback кэш
        try {
            this.fallbackCache.set(key, {
                data: value,
                expiresAt: Date.now() + (ttl * 1000)
            });
            return true;
        } catch (error) {
            console.error('Ошибка сохранения в fallback кэш:', error);
            return false;
        }
    }

    async del(key) {
        // Всегда используем fallback кэш
        this.fallbackCache.delete(key);
        return true;
    }

    async exists(key) {
        // Всегда используем fallback кэш
        const fallbackValue = this.fallbackCache.get(key);
        return fallbackValue && fallbackValue.expiresAt > Date.now();
    }

    async flush() {
        // Всегда используем fallback кэш
        this.fallbackCache.clear();
        return true;
    }

    // Дополнительные методы для fallback кэша
    async getAllKeys() {
        // Всегда используем fallback кэш
        return Array.from(this.fallbackCache.keys());
    }

    // Очистка устаревших записей из fallback кэша
    cleanupFallbackCache() {
        const now = Date.now();
        for (const [key, value] of this.fallbackCache.entries()) {
            if (value.expiresAt <= now) {
                this.fallbackCache.delete(key);
            }
        }
    }

    // Получение статуса подключения
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            retryCount: this.retryCount,
            fallbackCacheSize: this.fallbackCache.size
        };
    }
}

module.exports = RedisService;

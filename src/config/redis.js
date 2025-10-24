const Redis = require('ioredis');
const config = require('./config');

class RedisService {
    constructor() {
        this.isConnected = false;
        this.fallbackCache = new Map(); // In-memory fallback
        this.retryCount = 0;
        this.maxRetries = 5;
        
        // Подавляем unhandled error events для Redis
        this.setupErrorHandling();
        this.initializeRedis();
    }

    setupErrorHandling() {
        // Подавляем unhandled error events от ioredis
        const originalEmit = process.emit;
        process.emit = function(event, ...args) {
            if (event === 'unhandledRejection' && args[0] && args[0].message && args[0].message.includes('ECONNREFUSED')) {
                console.warn('⚠️ Redis подключение недоступно, используем fallback');
                return false;
            }
            return originalEmit.apply(this, arguments);
        };
    }

    initializeRedis() {
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
                retryDelayOnFailover: 1000,
                maxRetriesPerRequest: 1, // Уменьшаем количество попыток
                lazyConnect: true,
                connectTimeout: 3000, // Уменьшаем timeout
                commandTimeout: 3000,
                retryDelayOnClusterDown: 300,
                enableReadyCheck: false,
                maxRetriesPerRequest: 1, // Ограничиваем попытки
                retryDelayOnFailover: 5000, // Увеличиваем задержку
                maxRetriesPerRequest: 1,
                // Отключаем автоматические попытки переподключения
                enableAutoPipelining: false,
                enableOfflineQueue: false
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
                // Подавляем повторяющиеся ошибки подключения
                if (error.code === 'ECONNREFUSED' && this.retryCount > 2) {
                    console.warn('⚠️ Redis недоступен, используем fallback кэш');
                    this.isConnected = false;
                    return;
                }
                
                console.warn('⚠️ Ошибка Redis (используем fallback):', error.message);
                this.isConnected = false;
                this.handleRedisError(error);
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
        // Если это ошибка подключения и мы уже пытались несколько раз, не переподключаемся
        if (error.code === 'ECONNREFUSED' && this.retryCount >= 2) {
            console.warn('⚠️ Redis недоступен, используем fallback кэш. Переподключение отключено.');
            return;
        }

        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            setTimeout(() => {
                console.log(`🔄 Попытка переподключения к Redis (${this.retryCount}/${this.maxRetries})`);
                this.initializeRedis();
            }, 5000 * this.retryCount); // Увеличиваем задержку
        } else {
            console.warn('⚠️ Максимальное количество попыток подключения к Redis исчерпано. Используем fallback кэш.');
        }
    }

    async get(key) {
        if (this.isConnected && this.client) {
            try {
                const value = await this.client.get(key);
                return value ? JSON.parse(value) : null;
            } catch (error) {
                console.warn('⚠️ Ошибка получения из Redis, используем fallback:', error.message);
                this.isConnected = false;
            }
        }
        
        // Fallback to in-memory cache
        const fallbackValue = this.fallbackCache.get(key);
        if (fallbackValue && fallbackValue.expiresAt > Date.now()) {
            return fallbackValue.data;
        } else if (fallbackValue) {
            this.fallbackCache.delete(key);
        }
        return null;
    }

    async set(key, value, ttl = 3600) {
        if (this.isConnected && this.client) {
            try {
                await this.client.setex(key, ttl, JSON.stringify(value));
                return true;
            } catch (error) {
                console.warn('⚠️ Ошибка сохранения в Redis, используем fallback:', error.message);
                this.isConnected = false;
            }
        }
        
        // Fallback to in-memory cache
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
        if (this.isConnected && this.client) {
            try {
                await this.client.del(key);
            } catch (error) {
                console.warn('⚠️ Ошибка удаления из Redis, используем fallback:', error.message);
                this.isConnected = false;
            }
        }
        
        // Fallback to in-memory cache
        this.fallbackCache.delete(key);
        return true;
    }

    async exists(key) {
        if (this.isConnected && this.client) {
            try {
                const result = await this.client.exists(key);
                return result === 1;
            } catch (error) {
                console.warn('⚠️ Ошибка проверки существования в Redis, используем fallback:', error.message);
                this.isConnected = false;
            }
        }
        
        // Fallback to in-memory cache
        const fallbackValue = this.fallbackCache.get(key);
        return fallbackValue && fallbackValue.expiresAt > Date.now();
    }

    async flush() {
        if (this.isConnected && this.client) {
            try {
                await this.client.flushall();
            } catch (error) {
                console.warn('⚠️ Ошибка очистки Redis, используем fallback:', error.message);
                this.isConnected = false;
            }
        }
        
        // Fallback to in-memory cache
        this.fallbackCache.clear();
        return true;
    }

    // Дополнительные методы для fallback кэша
    async getAllKeys() {
        if (this.isConnected && this.client) {
            try {
                return await this.client.keys('*');
            } catch (error) {
                console.warn('⚠️ Ошибка получения ключей из Redis, используем fallback:', error.message);
                this.isConnected = false;
            }
        }
        
        // Fallback to in-memory cache
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

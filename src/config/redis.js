const Redis = require('ioredis');
const config = require('./config');

class RedisService {
    constructor() {
        this.client = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });

        this.client.on('connect', () => {
            console.log('✅ Redis подключен');
        });

        this.client.on('error', (error) => {
            console.error('❌ Ошибка Redis:', error);
        });
    }

    async get(key) {
        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('Ошибка получения из кэша:', error);
            return null;
        }
    }

    async set(key, value, ttl = 3600) {
        try {
            await this.client.setex(key, ttl, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Ошибка сохранения в кэш:', error);
            return false;
        }
    }

    async del(key) {
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error('Ошибка удаления из кэша:', error);
            return false;
        }
    }

    async exists(key) {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            console.error('Ошибка проверки существования ключа:', error);
            return false;
        }
    }

    async flush() {
        try {
            await this.client.flushall();
            return true;
        } catch (error) {
            console.error('Ошибка очистки кэша:', error);
            return false;
        }
    }
}

module.exports = RedisService;

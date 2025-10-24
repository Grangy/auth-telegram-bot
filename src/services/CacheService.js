const RedisService = require('../config/redis');
const logger = require('../utils/logger');

class CacheService {
    constructor() {
        this.redis = new RedisService();
        this.defaultTTL = 3600; // 1 час
    }

    // User cache
    async getUserByPhone(phone) {
        const key = `user:phone:${phone}`;
        return await this.redis.get(key);
    }

    async setUserByPhone(phone, user, ttl = this.defaultTTL) {
        const key = `user:phone:${phone}`;
        return await this.redis.set(key, user, ttl);
    }

    async getUserByTelegramId(telegramUserId) {
        const key = `user:telegram:${telegramUserId}`;
        return await this.redis.get(key);
    }

    async setUserByTelegramId(telegramUserId, user, ttl = this.defaultTTL) {
        const key = `user:telegram:${telegramUserId}`;
        return await this.redis.set(key, user, ttl);
    }

    async invalidateUser(phone, telegramUserId = null) {
        const keys = [`user:phone:${phone}`];
        if (telegramUserId) {
            keys.push(`user:telegram:${telegramUserId}`);
        }
        
        for (const key of keys) {
            await this.redis.del(key);
        }
    }

    // Session cache
    async getSessionBySocketId(socketId) {
        const key = `session:socket:${socketId}`;
        return await this.redis.get(key);
    }

    async setSessionBySocketId(socketId, session, ttl = this.defaultTTL) {
        const key = `session:socket:${socketId}`;
        return await this.redis.set(key, session, ttl);
    }

    async invalidateSession(socketId) {
        const key = `session:socket:${socketId}`;
        return await this.redis.del(key);
    }

    // Auth key cache
    async getAuthKey(key) {
        const cacheKey = `authkey:${key}`;
        return await this.redis.get(cacheKey);
    }

    async setAuthKey(key, authKeyData, ttl = 300) { // 5 минут
        const cacheKey = `authkey:${key}`;
        return await this.redis.set(cacheKey, authKeyData, ttl);
    }

    async invalidateAuthKey(key) {
        const cacheKey = `authkey:${key}`;
        return await this.redis.del(cacheKey);
    }

    // SMS code cache
    async getSmsCode(phone) {
        const key = `smscode:${phone}`;
        return await this.redis.get(key);
    }

    async setSmsCode(phone, smsCodeData, ttl = 300) { // 5 минут
        const key = `smscode:${phone}`;
        return await this.redis.set(key, smsCodeData, ttl);
    }

    async invalidateSmsCode(phone) {
        const key = `smscode:${phone}`;
        return await this.redis.del(key);
    }

    // Long term session cache
    async getLongTermSession(token) {
        const key = `longterm:${token}`;
        return await this.redis.get(key);
    }

    async setLongTermSession(token, sessionData, ttl = 86400) { // 24 часа
        const key = `longterm:${token}`;
        return await this.redis.set(key, sessionData, ttl);
    }

    async invalidateLongTermSession(token) {
        const key = `longterm:${token}`;
        return await this.redis.del(key);
    }

    // Generic cache operations
    async get(key) {
        return await this.redis.get(key);
    }

    async set(key, value, ttl = this.defaultTTL) {
        return await this.redis.set(key, value, ttl);
    }

    async del(key) {
        return await this.redis.del(key);
    }

    async exists(key) {
        return await this.redis.exists(key);
    }

    async flush() {
        return await this.redis.flush();
    }

    // Cache warming
    async warmUserCache(user) {
        try {
            await this.setUserByPhone(user.phone, user);
            if (user.telegramUserId) {
                await this.setUserByTelegramId(user.telegramUserId, user);
            }
            logger.debug(`Кэш пользователя ${user.phone} прогрет`);
        } catch (error) {
            logger.error('Ошибка прогрева кэша пользователя:', error);
        }
    }

    async warmSessionCache(session) {
        try {
            await this.setSessionBySocketId(session.socketId, session);
            logger.debug(`Кэш сессии ${session.socketId} прогрет`);
        } catch (error) {
            logger.error('Ошибка прогрева кэша сессии:', error);
        }
    }

    // Cache statistics
    async getStats() {
        try {
            const info = await this.redis.client.info('memory');
            return {
                memory: info,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Ошибка получения статистики кэша:', error);
            return null;
        }
    }
}

module.exports = CacheService;

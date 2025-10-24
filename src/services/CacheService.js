const logger = require('../utils/logger');

class CacheService {
    constructor() {
        this.cache = new Map(); // In-memory cache
        this.defaultTTL = 3600; // 1 час
        
        // Периодическая очистка устаревших записей
        setInterval(() => {
            this.cleanupExpiredEntries();
        }, 5 * 60 * 1000); // каждые 5 минут
        
        logger.info('✅ In-memory кэш инициализирован');
    }

    // User cache
    async getUserByPhone(phone) {
        const key = `user:phone:${phone}`;
        return this.get(key);
    }

    async setUserByPhone(phone, user, ttl = this.defaultTTL) {
        const key = `user:phone:${phone}`;
        return this.set(key, user, ttl);
    }

    async getUserByTelegramId(telegramUserId) {
        const key = `user:telegram:${telegramUserId}`;
        return this.get(key);
    }

    async setUserByTelegramId(telegramUserId, user, ttl = this.defaultTTL) {
        const key = `user:telegram:${telegramUserId}`;
        return this.set(key, user, ttl);
    }

    // Session cache
    async getSession(sessionId) {
        const key = `session:${sessionId}`;
        return this.get(key);
    }

    async setSession(sessionId, sessionData, ttl = this.defaultTTL) {
        const key = `session:${sessionId}`;
        return this.set(key, sessionData, ttl);
    }

    async deleteSession(sessionId) {
        const key = `session:${sessionId}`;
        return this.del(key);
    }

    // Get session by socket ID (alias for compatibility)
    async getSessionBySocketId(socketId) {
        return this.getSession(socketId);
    }

    // Set session by socket ID (alias for compatibility)
    async setSessionBySocketId(socketId, sessionData, ttl = this.defaultTTL) {
        return this.setSession(socketId, sessionData, ttl);
    }

    // Long-term session cache
    async getLongTermSession(token) {
        const key = `long_term_session:${token}`;
        return this.get(key);
    }

    async setLongTermSession(token, sessionData, ttl = 24 * 3600) { // 24 часа
        const key = `long_term_session:${token}`;
        return this.set(key, sessionData, ttl);
    }

    async deleteLongTermSession(token) {
        const key = `long_term_session:${token}`;
        return this.del(key);
    }

    // SMS code cache
    async getSmsCode(phone) {
        const key = `sms_code:${phone}`;
        return this.get(key);
    }

    async setSmsCode(phone, code, ttl = 300) { // 5 минут
        const key = `sms_code:${phone}`;
        return this.set(key, { code, timestamp: Date.now() }, ttl);
    }

    async deleteSmsCode(phone) {
        const key = `sms_code:${phone}`;
        return this.del(key);
    }

    // Auth key cache
    async getAuthKey(key) {
        const cacheKey = `auth_key:${key}`;
        return this.get(cacheKey);
    }

    async setAuthKey(key, authData, ttl = 300) { // 5 минут
        const cacheKey = `auth_key:${key}`;
        return this.set(cacheKey, authData, ttl);
    }

    async deleteAuthKey(key) {
        const cacheKey = `auth_key:${key}`;
        return this.del(cacheKey);
    }

    async invalidateAuthKey(key) {
        return this.deleteAuthKey(key);
    }

    // Contact processing status
    async getContactProcessingStatus(contactKey) {
        const key = `contact_processing:${contactKey}`;
        return this.get(key);
    }

    async setContactProcessingStatus(contactKey, status, ttl = 30) {
        const key = `contact_processing:${contactKey}`;
        return this.set(key, status, ttl);
    }

    async clearContactProcessingStatus(contactKey) {
        const key = `contact_processing:${contactKey}`;
        return this.del(key);
    }

    // Basic cache operations
    async get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.data;
    }

    async set(key, value, ttl = this.defaultTTL) {
        const entry = {
            data: value,
            expiresAt: ttl ? Date.now() + (ttl * 1000) : null
        };
        this.cache.set(key, entry);
        return true;
    }

    async del(key) {
        this.cache.delete(key);
        return true;
    }

    async exists(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;
        
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }

    async flush() {
        this.cache.clear();
        return true;
    }

    // Cleanup expired entries
    cleanupExpiredEntries() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiresAt && entry.expiresAt <= now) {
                this.cache.delete(key);
            }
        }
    }

    // Cache statistics
    async getStats() {
        return {
            size: this.cache.size,
            memory: 'In-memory cache',
            timestamp: new Date().toISOString()
        };
    }

    // Получение статуса кэша
    getCacheStatus() {
        return {
            isConnected: true, // In-memory всегда доступен
            retryCount: 0,
            fallbackCacheSize: this.cache.size
        };
    }

    // Проверка доступности кэша
    async isCacheAvailable() {
        return true; // In-memory всегда доступен
    }

    // Warm cache for user
    async warmUserCache(user) {
        try {
            await this.setUserByPhone(user.phone, user);
            await this.setUserByTelegramId(user.telegramUserId, user);
            logger.info(`Кэш прогрелся для пользователя ${user.phone}`);
        } catch (error) {
            logger.error('Ошибка прогрева кэша пользователя:', error);
        }
    }

    // Warm cache for session
    async warmSessionCache(session) {
        try {
            await this.setSession(session.socketId, session);
            logger.info(`Кэш прогрелся для сессии ${session.socketId}`);
        } catch (error) {
            logger.error('Ошибка прогрева кэша сессии:', error);
        }
    }

    // Invalidate methods for compatibility
    async invalidateSession(socketId) {
        return this.deleteSession(socketId);
    }

    async invalidateLongTermSession(token) {
        return this.deleteLongTermSession(token);
    }

    async invalidateSmsCode(phone) {
        return this.deleteSmsCode(phone);
    }

    async invalidateAuthKey(key) {
        return this.deleteAuthKey(key);
    }
}

module.exports = CacheService;
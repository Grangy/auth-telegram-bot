const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const errorHandler = require('../middleware/errorHandler');

class PrismaService {
    constructor() {
        this.prisma = new PrismaClient({
            log: ['query', 'info', 'warn', 'error'],
        });

        this.prisma.$on('query', (e) => {
            logger.debug('Prisma Query:', {
                query: e.query,
                params: e.params,
                duration: e.duration
            });
        });
    }

    async connect() {
        try {
            await this.prisma.$connect();
            logger.info('✅ База данных подключена');
            
            // Проверяем состояние базы данных
            await this.healthCheck();
        } catch (error) {
            logger.error('❌ Ошибка подключения к базе данных:', error);
            throw error;
        }
    }
    
    async healthCheck() {
        try {
            // Для MongoDB используем простой findFirst запрос вместо $queryRaw
            // Это проверяет соединение с базой данных
            await this.prisma.user.findFirst({
                take: 1,
                select: { id: true } // Выбираем только id для минимальной нагрузки
            });
            logger.debug('✅ Проверка здоровья базы данных пройдена');
            return true;
        } catch (error) {
            logger.error('❌ Ошибка проверки здоровья базы данных:', error);
            return false;
        }
    }

    async disconnect() {
        try {
            await this.prisma.$disconnect();
            logger.info('✅ Соединение с базой данных закрыто');
        } catch (error) {
            logger.error('❌ Ошибка отключения от базы данных:', error);
        }
    }

    // User operations
    async createUser(userData) {
        // Валидация входных данных
        if (!userData.phone) {
            throw new Error('Поле phone обязательно для создания пользователя');
        }
        
        if (!userData.telegramUserId) {
            throw new Error('Поле telegramUserId обязательно для создания пользователя');
        }
        
        // Валидация формата номера телефона
        if (!userData.phone.startsWith('+7') || userData.phone.length !== 12) {
            throw new Error('Неверный формат номера телефона. Ожидается +7XXXXXXXXXX');
        }
        
        const maxRetries = 3;
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.prisma.user.create({
                    data: userData
                });
            } catch (error) {
                lastError = error;
                logger.warn(`Попытка ${attempt}/${maxRetries} создания пользователя не удалась:`, error.message);
                
                if (attempt < maxRetries) {
                    // Ждем перед повторной попыткой
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        
        logger.error('Ошибка создания пользователя после всех попыток:', lastError);
        throw lastError;
    }

    async findUserByPhone(phone) {
        try {
            return await this.prisma.user.findUnique({
                where: { phone }
            });
        } catch (error) {
            const result = await errorHandler.handleError(error, 'findUserByPhone', { phone });
            if (result.shouldRetry) {
                return await this.findUserByPhone(phone);
            }
            throw error;
        }
    }

    async findUserByTelegramId(telegramUserId) {
        try {
            return await this.prisma.user.findUnique({
                where: { telegramUserId }
            });
        } catch (error) {
            logger.error('Ошибка поиска пользователя по Telegram ID:', error);
            throw error;
        }
    }

    async updateUser(phone, userData) {
        try {
            return await this.prisma.user.update({
                where: { phone },
                data: userData
            });
        } catch (error) {
            logger.error('Ошибка обновления пользователя:', error);
            throw error;
        }
    }

    // Session operations
    async createSession(sessionData) {
        try {
            return await this.prisma.session.create({
                data: sessionData
            });
        } catch (error) {
            logger.error('Ошибка создания сессии:', error);
            throw error;
        }
    }

    async findSessionBySocketId(socketId) {
        try {
            return await this.prisma.session.findUnique({
                where: { socketId }
            });
        } catch (error) {
            // Обрабатываем специфические ошибки базы данных
            if (error.code === 'P2010') {
                logger.error('Ошибка подключения к базе данных:', error.message);
                // Попытка переподключения
                try {
                    await this.prisma.$connect();
                    logger.info('Переподключение к базе данных успешно');
                    // Повторяем запрос
                    return await this.prisma.session.findUnique({
                        where: { socketId }
                    });
                } catch (reconnectError) {
                    logger.error('Ошибка переподключения к базе данных:', reconnectError);
                    throw error;
                }
            }
            logger.error('Ошибка поиска сессии по socket ID:', error);
            throw error;
        }
    }

    async updateSession(socketId, sessionData) {
        try {
            // Сначала проверяем, существует ли сессия
            const existingSession = await this.prisma.session.findUnique({
                where: { socketId }
            });

            if (!existingSession) {
                // Если сессии нет, создаем новую
                // Убеждаемся, что phone присутствует в данных
                if (!sessionData.phone) {
                    throw new Error('Поле phone обязательно для создания сессии');
                }
                
                return await this.prisma.session.create({
                    data: {
                        socketId,
                        phone: sessionData.phone,
                        authorized: sessionData.authorized || false,
                        name: sessionData.name || null,
                        telegramUserId: sessionData.telegramUserId || null,
                        expiresAt: sessionData.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 часа по умолчанию
                    }
                });
            }

            // Если сессия существует, обновляем её
            return await this.prisma.session.update({
                where: { socketId },
                data: sessionData
            });
        } catch (error) {
            logger.error('Ошибка обновления сессии:', error);
            throw error;
        }
    }

    async deleteSession(socketId) {
        try {
            // Сначала проверяем, существует ли сессия
            const existingSession = await this.prisma.session.findUnique({
                where: { socketId }
            });

            if (!existingSession) {
                logger.warn(`Сессия с socketId ${socketId} не найдена для удаления`);
                return null;
            }

            return await this.prisma.session.delete({
                where: { socketId }
            });
        } catch (error) {
            logger.error('Ошибка удаления сессии:', error);
            throw error;
        }
    }

    // AuthKey operations
    async createAuthKey(authKeyData) {
        try {
            return await this.prisma.authKey.create({
                data: authKeyData
            });
        } catch (error) {
            logger.error('Ошибка создания ключа авторизации:', error);
            throw error;
        }
    }

    async findAuthKey(key) {
        try {
            return await this.prisma.authKey.findUnique({
                where: { key }
            });
        } catch (error) {
            logger.error('Ошибка поиска ключа авторизации:', error);
            throw error;
        }
    }

    async markAuthKeyAsUsed(key) {
        try {
            return await this.prisma.authKey.update({
                where: { key },
                data: { used: true }
            });
        } catch (error) {
            logger.error('Ошибка пометки ключа как использованного:', error);
            throw error;
        }
    }

    async findActiveAuthKeysByPhone(phone) {
        try {
            return await this.prisma.authKey.findMany({
                where: {
                    phone: phone,
                    used: false,
                    expiresAt: {
                        gt: new Date()
                    }
                },
                orderBy: {
                    timestamp: 'desc'
                }
            });
        } catch (error) {
            logger.error('Ошибка поиска активных ключей авторизации по номеру:', error);
            throw error;
        }
    }

    // SMS Code operations
    async createSmsCode(smsCodeData) {
        try {
            logger.debug('Создание SMS кода:', smsCodeData);
            const result = await this.prisma.smsCode.upsert({
                where: { phone: smsCodeData.phone },
                update: smsCodeData,
                create: smsCodeData
            });
            logger.debug('SMS код создан в БД:', result);
            return result;
        } catch (error) {
            logger.error('Ошибка создания SMS кода:', error);
            throw error;
        }
    }

    async findSmsCode(phone) {
        try {
            logger.debug(`Поиск SMS кода для номера: ${phone}`);
            const result = await this.prisma.smsCode.findUnique({
                where: { phone }
            });
            logger.debug(`Найден SMS код в БД:`, result);
            return result;
        } catch (error) {
            logger.error('Ошибка поиска SMS кода:', error);
            throw error;
        }
    }

    async markSmsCodeAsUsed(phone) {
        try {
            logger.debug(`Пометка SMS кода как использованного для номера: ${phone}`);
            const result = await this.prisma.smsCode.update({
                where: { phone },
                data: { used: true }
            });
            logger.debug(`SMS код помечен как использованный:`, result);
            return result;
        } catch (error) {
            logger.error('Ошибка пометки SMS кода как использованного:', error);
            throw error;
        }
    }

    // Long Term Session operations
    async createLongTermSession(sessionData) {
        try {
            return await this.prisma.longTermSession.create({
                data: sessionData
            });
        } catch (error) {
            logger.error('Ошибка создания долгосрочной сессии:', error);
            throw error;
        }
    }

    async findLongTermSession(token) {
        try {
            return await this.prisma.longTermSession.findUnique({
                where: { token }
            });
        } catch (error) {
            logger.error('Ошибка поиска долгосрочной сессии:', error);
            throw error;
        }
    }

    async deleteLongTermSession(token) {
        try {
            return await this.prisma.longTermSession.delete({
                where: { token }
            });
        } catch (error) {
            logger.error('Ошибка удаления долгосрочной сессии:', error);
            throw error;
        }
    }

    // Cleanup operations
    async cleanupExpiredSessions() {
        try {
            const result = await this.prisma.session.deleteMany({
                where: {
                    expiresAt: {
                        lt: new Date()
                    }
                }
            });
            
            if (result.count > 0) {
                logger.info(`Очищено ${result.count} устаревших сессий`);
            }
            
            return result.count;
        } catch (error) {
            logger.error('Ошибка очистки устаревших сессий:', error);
            throw error;
        }
    }

    async cleanupExpiredSmsCodes() {
        try {
            const result = await this.prisma.smsCode.deleteMany({
                where: {
                    expiresAt: {
                        lt: new Date()
                    }
                }
            });
            
            if (result.count > 0) {
                logger.info(`Очищено ${result.count} устаревших SMS кодов`);
            }
            
            return result.count;
        } catch (error) {
            logger.error('Ошибка очистки устаревших SMS кодов:', error);
            throw error;
        }
    }

    async cleanupExpiredAuthKeys() {
        try {
            const result = await this.prisma.authKey.deleteMany({
                where: {
                    expiresAt: {
                        lt: new Date()
                    }
                }
            });
            
            if (result.count > 0) {
                logger.info(`Очищено ${result.count} устаревших ключей авторизации`);
            }
            
            return result.count;
        } catch (error) {
            logger.error('Ошибка очистки устаревших ключей авторизации:', error);
            throw error;
        }
    }

    // Очистка всех данных (для тестирования)
    async clearAllData() {
        try {
            logger.warn('🧹 Очистка всех данных из базы данных...');
            
            // Удаляем в правильном порядке (с учетом внешних ключей)
            const sessionsResult = await this.prisma.session.deleteMany({});
            const smsCodesResult = await this.prisma.smsCode.deleteMany({});
            const authKeysResult = await this.prisma.authKey.deleteMany({});
            const longTermSessionsResult = await this.prisma.longTermSession.deleteMany({});
            const usersResult = await this.prisma.user.deleteMany({});
            const cacheResult = await this.prisma.cacheEntry.deleteMany({});
            
            logger.warn(`🗑️ Очищено:`);
            logger.warn(`   - Сессий: ${sessionsResult.count}`);
            logger.warn(`   - SMS кодов: ${smsCodesResult.count}`);
            logger.warn(`   - Ключей авторизации: ${authKeysResult.count}`);
            logger.warn(`   - Долгосрочных сессий: ${longTermSessionsResult.count}`);
            logger.warn(`   - Пользователей: ${usersResult.count}`);
            logger.warn(`   - Кэш записей: ${cacheResult.count}`);
            
            return {
                sessions: sessionsResult.count,
                smsCodes: smsCodesResult.count,
                authKeys: authKeysResult.count,
                longTermSessions: longTermSessionsResult.count,
                users: usersResult.count,
                cache: cacheResult.count
            };
        } catch (error) {
            logger.error('Ошибка очистки всех данных:', error);
            throw error;
        }
    }

    // Очистка только пользователей
    async clearUsers() {
        try {
            logger.warn('🧹 Очистка пользователей из базы данных...');
            
            // Сначала удаляем связанные данные
            const sessionsResult = await this.prisma.session.deleteMany({});
            const longTermSessionsResult = await this.prisma.longTermSession.deleteMany({});
            const usersResult = await this.prisma.user.deleteMany({});
            
            logger.warn(`🗑️ Очищено:`);
            logger.warn(`   - Пользователей: ${usersResult.count}`);
            logger.warn(`   - Сессий: ${sessionsResult.count}`);
            logger.warn(`   - Долгосрочных сессий: ${longTermSessionsResult.count}`);
            
            return {
                users: usersResult.count,
                sessions: sessionsResult.count,
                longTermSessions: longTermSessionsResult.count
            };
        } catch (error) {
            logger.error('Ошибка очистки пользователей:', error);
            throw error;
        }
    }
}

module.exports = PrismaService;

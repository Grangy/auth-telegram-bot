const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

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
        } catch (error) {
            logger.error('❌ Ошибка подключения к базе данных:', error);
            throw error;
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
        try {
            return await this.prisma.user.create({
                data: userData
            });
        } catch (error) {
            logger.error('Ошибка создания пользователя:', error);
            throw error;
        }
    }

    async findUserByPhone(phone) {
        try {
            return await this.prisma.user.findUnique({
                where: { phone }
            });
        } catch (error) {
            logger.error('Ошибка поиска пользователя по телефону:', error);
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
            logger.error('Ошибка поиска сессии по socket ID:', error);
            throw error;
        }
    }

    async updateSession(socketId, sessionData) {
        try {
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

    // SMS Code operations
    async createSmsCode(smsCodeData) {
        try {
            return await this.prisma.smsCode.upsert({
                where: { phone: smsCodeData.phone },
                update: smsCodeData,
                create: smsCodeData
            });
        } catch (error) {
            logger.error('Ошибка создания SMS кода:', error);
            throw error;
        }
    }

    async findSmsCode(phone) {
        try {
            return await this.prisma.smsCode.findUnique({
                where: { phone }
            });
        } catch (error) {
            logger.error('Ошибка поиска SMS кода:', error);
            throw error;
        }
    }

    async markSmsCodeAsUsed(phone) {
        try {
            return await this.prisma.smsCode.update({
                where: { phone },
                data: { used: true }
            });
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
}

module.exports = PrismaService;

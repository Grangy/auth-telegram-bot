const fs = require('fs');
const PrismaService = require('../services/PrismaService');
const logger = require('../utils/logger');

async function migrateFromJSON() {
    const prismaService = new PrismaService();
    
    try {
        await prismaService.connect();
        
        // Читаем старую базу данных
        const oldData = JSON.parse(fs.readFileSync('database.json', 'utf8'));
        
        logger.info('Начинаем миграцию данных...');
        
        // Мигрируем пользователей
        if (oldData.users) {
            for (const [phone, userData] of Object.entries(oldData.users)) {
                try {
                    await prismaService.createUser({
                        phone: userData.phone,
                        name: userData.name,
                        telegramUserId: userData.telegramUserId,
                        lastAuth: userData.lastAuth ? new Date(userData.lastAuth) : null
                    });
                    logger.info(`Мигрирован пользователь: ${phone}`);
                } catch (error) {
                    logger.error(`Ошибка миграции пользователя ${phone}:`, error);
                }
            }
        }
        
        // Мигрируем сессии
        if (oldData.sessions) {
            for (const [sessionId, sessionData] of Object.entries(oldData.sessions)) {
                try {
                    await prismaService.createSession({
                        socketId: sessionData.socketId,
                        phone: sessionData.phone,
                        authorized: sessionData.authorized,
                        name: sessionData.name,
                        telegramUserId: sessionData.telegramUserId,
                        expiresAt: new Date(sessionData.timestamp + 24 * 60 * 60 * 1000)
                    });
                    logger.info(`Мигрирована сессия: ${sessionId}`);
                } catch (error) {
                    logger.error(`Ошибка миграции сессии ${sessionId}:`, error);
                }
            }
        }
        
        // Мигрируем долгосрочные сессии
        if (oldData.longTermSessions) {
            for (const [token, sessionData] of Object.entries(oldData.longTermSessions)) {
                try {
                    await prismaService.createLongTermSession({
                        token: sessionData.token,
                        phone: sessionData.phone,
                        name: sessionData.name,
                        telegramUserId: sessionData.telegramUserId,
                        createdAt: new Date(sessionData.createdAt),
                        expiresAt: new Date(sessionData.expiresAt)
                    });
                    logger.info(`Мигрирована долгосрочная сессия: ${token}`);
                } catch (error) {
                    logger.error(`Ошибка миграции долгосрочной сессии ${token}:`, error);
                }
            }
        }
        
        logger.info('✅ Миграция данных завершена успешно!');
        
    } catch (error) {
        logger.error('❌ Ошибка миграции:', error);
    } finally {
        await prismaService.disconnect();
    }
}

// Запускаем миграцию если файл вызван напрямую
if (require.main === module) {
    migrateFromJSON();
}

module.exports = migrateFromJSON;

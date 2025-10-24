require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    botUsername: process.env.BOT_USERNAME,
    
    // Настройки базы данных
    database: {
        path: 'database.json', // Для совместимости со старым сервером
        url: process.env.DATABASE_URL,
        backupPath: 'logs/backups'
    },
    
    // Настройки Redis
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        ttl: {
            user: 3600,        // 1 час
            session: 3600,     // 1 час
            authKey: 300,      // 5 минут
            smsCode: 300,      // 5 минут
            longTerm: 86400    // 24 часа
        }
    },
    
    // Настройки сессий
    session: {
        maxAge: 24 * 60 * 60 * 1000, // 24 часа
        cleanupInterval: 5 * 60 * 1000 // 5 минут
    },
    
    // Настройки кодов
    smsCode: {
        maxAge: 5 * 60 * 1000, // 5 минут
        length: 4
    },
    
    // Настройки логирования
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        maxFiles: 5,
        maxSize: '10m'
    }
};

module.exports = config;

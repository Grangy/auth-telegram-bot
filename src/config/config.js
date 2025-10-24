require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    botUsername: process.env.BOT_USERNAME,
    
    // Настройки базы данных
    database: {
        path: 'database.json',
        backupPath: 'logs/backups'
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

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

// Импорт наших модулей
const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const DatabaseService = require('./src/services/DatabaseService');
const TelegramService = require('./src/services/TelegramService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Инициализация сервисов
const databaseService = new DatabaseService(config.database.path);
const telegramService = new TelegramService();

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Создание долгосрочной сессии
function createLongTermSession(userData) {
    const sessionToken = uuidv4();
    const expiresAt = Date.now() + config.session.maxAge;
    
    const longTermSession = {
        token: sessionToken,
        phone: userData.phone,
        name: userData.name,
        telegramUserId: userData.telegramUserId,
        createdAt: Date.now(),
        expiresAt: expiresAt
    };
    
    return { sessionToken, longTermSession };
}

// Получение сессии по socket ID
function getSessionBySocketId(socketId) {
    const db = databaseService.loadDatabase();
    for (const [sessionId, session] of Object.entries(db.sessions || {})) {
        if (session.socketId === socketId) {
            return { sessionId, session };
        }
    }
    return null;
}

// Обработка подключения Socket.IO
io.on('connection', (socket) => {
    logger.info('Пользователь подключился', { socketId: socket.id });
    
    // Обработка отключения
    socket.on('disconnect', () => {
        logger.info('Пользователь отключился', { socketId: socket.id });
        
        // НЕ очищаем сессию при отключении - пользователь может переподключиться
        const sessionData = getSessionBySocketId(socket.id);
        if (sessionData) {
            logger.info(`Сессия ${sessionData.sessionId} сохранена для переподключения`);
        }
    });

    // Проверка существующей авторизации
    socket.on('checkAuth', (data) => {
        if (data && data.sessionToken) {
            const db = databaseService.loadDatabase();
            const longTermSession = db.longTermSessions?.[data.sessionToken];
            
            if (longTermSession && longTermSession.expiresAt > Date.now()) {
                socket.emit('alreadyAuthorized', {
                    phone: longTermSession.phone,
                    name: longTermSession.name
                });
                return;
            }
        }
        
        // Проверяем обычную сессию
        const sessionData = getSessionBySocketId(socket.id);
        if (sessionData && sessionData.session.authorized) {
            socket.emit('alreadyAuthorized', {
                phone: sessionData.session.phone,
                name: sessionData.session.name
            });
        }
    });

    // Запрос авторизации
    socket.on('requestAuth', async (data) => {
        try {
            const { phone } = data;
            if (!phone) {
                socket.emit('authError', { message: 'Номер телефона не указан' });
                return;
            }
            
            logger.info(`Запрос авторизации для номера: ${phone}`);
            
            const db = databaseService.loadDatabase();
            
            // Проверяем, есть ли уже пользователь с таким номером
            const existingUser = Object.values(db.users || {}).find(user => user.phone === phone);
            
            if (existingUser && existingUser.telegramUserId) {
                // Пользователь уже существует, отправляем SMS код
                const smsCode = Math.floor(1000 + Math.random() * 9000).toString();
                
                // Сохраняем код для проверки
                if (!db.smsCodes) db.smsCodes = {};
                db.smsCodes[phone] = {
                    code: smsCode,
                    timestamp: Date.now(),
                    used: false,
                    socketId: socket.id
                };
                
                databaseService.saveDatabase(db);
                
                // Отправляем код в Telegram
                await telegramService.sendMessage(existingUser.telegramUserId, 
                    `🔐 Авторизация\n\n` +
                    `Код авторизации: ${smsCode}\n\n` +
                    `Введите этот код на сайте для входа в систему.`
                );
                
                socket.emit('smsCodeSent', { phone });
                logger.info(`SMS код отправлен существующему пользователю ${existingUser.telegramUserId}: ${smsCode}`);
                return;
            }
            
            // Новый пользователь - создаем обычную авторизацию через Telegram
            const authKey = uuidv4().substring(0, 8);
            
            // Сохраняем ключ авторизации
            if (!db.authKeys) db.authKeys = {};
            db.authKeys[authKey] = {
                phone: phone,
                socketId: socket.id,
                timestamp: Date.now(),
                used: false
            };
            
            // Создаем сессию
            const sessionId = uuidv4();
            if (!db.sessions) db.sessions = {};
            db.sessions[sessionId] = {
                socketId: socket.id,
                phone: phone,
                authorized: false,
                timestamp: Date.now()
            };
            
            databaseService.saveDatabase(db);
            
            // Генерируем ссылку для авторизации
            const authLink = `https://t.me/${config.botUsername || 'your_bot'}?start=${authKey}`;
            
            // Генерируем QR-код
            QRCode.toDataURL(authLink, (error, qrCodeDataURL) => {
                if (error) {
                    logger.error('Ошибка генерации QR-кода:', error);
                    socket.emit('authKey', { 
                        key: authKey, 
                        link: authLink
                    });
                } else {
                    socket.emit('authKey', { 
                        key: authKey, 
                        link: authLink,
                        qrCode: qrCodeDataURL
                    });
                }
            });
            
        } catch (error) {
            logger.error('Ошибка в requestAuth:', error);
            socket.emit('authError', { message: 'Внутренняя ошибка сервера' });
        }
    });

    // Остальные обработчики событий...
    // (код сокращен для краткости)
});

// Периодическая очистка старых данных
setInterval(() => {
    databaseService.cleanupOldSessions();
}, config.session.cleanupInterval);

// Запуск сервера
server.listen(config.port, () => {
    logger.info(`🚀 Сервер запущен на порту ${config.port}`);
    logger.info(`📱 Telegram бот активен`);
    logger.info(`🌐 Откройте http://localhost:${config.port} в браузере`);
});

// Обработка завершения процесса
process.on('SIGINT', () => {
    logger.info('🛑 Завершение работы сервера...');
    telegramService.stopPolling();
    server.close(() => {
        logger.info('✅ Сервер остановлен');
        process.exit(0);
    });
});

module.exports = { app, server, io };

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Импорт наших модулей
const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const DatabaseService = require('./src/services/DatabaseService');
const TelegramService = require('./src/services/TelegramService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Инициализация сервисов
const databaseService = new DatabaseService(config.database.path || 'database.json');
const telegramService = new TelegramService();

// Получаем экземпляр бота для обработки событий
const bot = telegramService.getBot();

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Создание долгосрочной сессии
function createLongTermSession(userData) {
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + config.session.maxAge);
    
    return {
        token: sessionToken,
        phone: userData.phone,
        name: userData.name,
        telegramUserId: userData.telegramUserId,
        createdAt: new Date(),
        expiresAt: expiresAt
    };
}

// Получение сессии по socket ID
function getSessionBySocketId(socketId) {
    const db = databaseService.loadDatabase();
    const sessions = db.sessions || {};
    
    for (const [sessionId, session] of Object.entries(sessions)) {
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
        try {
            if (data && data.sessionToken) {
                const db = databaseService.loadDatabase();
                const longTermSession = db.longTermSessions?.[data.sessionToken];
                
                if (longTermSession && longTermSession.expiresAt > new Date()) {
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
        } catch (error) {
            logger.error('Ошибка проверки авторизации:', error);
        }
    });

    // Запрос авторизации
    socket.on('requestAuth', (data) => {
        try {
            const { phone } = data;
            if (!phone) {
                socket.emit('authError', { message: 'Номер телефона не указан' });
                return;
            }
            
            logger.info(`Запрос авторизации для номера: ${phone}`);
            
            const db = databaseService.loadDatabase();
            
            // Проверяем, существует ли пользователь
            const user = Object.values(db.users || {}).find(u => u.phone === phone);
            
            if (user && user.telegramUserId) {
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
                bot.sendMessage(user.telegramUserId, 
                    `🔐 Авторизация\n\n` +
                    `Код авторизации: ${smsCode}\n\n` +
                    `Введите этот код на сайте для входа в систему.`
                );
                
                socket.emit('smsCodeSent', { phone });
                logger.info(`SMS код отправлен существующему пользователю ${user.telegramUserId}: ${smsCode}`);
                return;
            }
            
            // Новый пользователь - создаем обычную авторизацию через Telegram
            const authKey = uuidv4().substring(0, 8);
            
            // Сохраняем ключ авторизации
            if (!db.authKeys) db.authKeys = {};
            db.authKeys[authKey] = {
                phone: phone,
                socketId: socket.id,
                used: false,
                timestamp: Date.now()
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

    // Проверка кода
    socket.on('verifyCode', (data) => {
        try {
            const { phone, code } = data;
            if (!phone || !code) {
                socket.emit('authError', { message: 'Не указан номер телефона или код' });
                return;
            }

            const db = databaseService.loadDatabase();
            const codeData = db.smsCodes?.[phone];
            
            if (!codeData || codeData.used || codeData.code !== code) {
                socket.emit('authError', { message: 'Неверный код' });
                return;
            }

            // Проверяем, не устарел ли код (5 минут)
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            if (now - codeData.timestamp > fiveMinutes) {
                socket.emit('authError', { message: 'Код устарел' });
                return;
            }

            // Код верный, помечаем как использованный
            codeData.used = true;
            databaseService.saveDatabase(db);

            // Находим пользователя
            const user = Object.values(db.users || {}).find(u => u.phone === phone);
            if (!user) {
                socket.emit('authError', { message: 'Пользователь не найден' });
                return;
            }

            // Создаем новую сессию
            const sessionId = uuidv4();
            if (!db.sessions) db.sessions = {};
            db.sessions[sessionId] = {
                socketId: socket.id,
                phone: phone,
                authorized: true,
                name: user.name,
                telegramUserId: user.telegramUserId,
                timestamp: Date.now()
            };

            // Создаем долгосрочную сессию
            const userData = {
                phone: phone,
                name: user.name,
                telegramUserId: user.telegramUserId
            };
            
            const { sessionToken, longTermSession } = createLongTermSession(userData);
            
            // Инициализируем longTermSessions если не существует
            if (!db.longTermSessions) {
                db.longTermSessions = {};
            }
            
            db.longTermSessions[sessionToken] = longTermSession;
            databaseService.saveDatabase(db);

            // Уведомляем клиент об успешной авторизации
            socket.emit('authSuccess', {
                phone: phone,
                name: user.name,
                sessionToken: sessionToken
            });

            logger.info(`Пользователь ${phone} успешно авторизован`);

        } catch (error) {
            logger.error('Ошибка в verifyCode:', error);
            socket.emit('authError', { message: 'Внутренняя ошибка сервера' });
        }
    });

    // Выход из системы
    socket.on('logout', () => {
        try {
            const sessionData = getSessionBySocketId(socket.id);
            if (sessionData) {
                const db = databaseService.loadDatabase();
                delete db.sessions[sessionData.sessionId];
                databaseService.saveDatabase(db);
                socket.emit('logoutSuccess');
                logger.info(`Пользователь вышел из системы: ${socket.id}`);
            }
        } catch (error) {
            logger.error('Ошибка в logout:', error);
        }
    });

    // Сброс сессии
    socket.on('resetSession', () => {
        try {
            const sessionData = getSessionBySocketId(socket.id);
            if (sessionData) {
                const db = databaseService.loadDatabase();
                const phone = sessionData.session.phone;
                
                // Удаляем текущую сессию
                delete db.sessions[sessionData.sessionId];
                
                // Находим пользователя по номеру
                const user = Object.values(db.users || {}).find(u => u.phone === phone);
                
                if (user && user.telegramUserId) {
                    // Генерируем код
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
                    bot.sendMessage(user.telegramUserId, 
                        `🔄 Сброс сессии\n\n` +
                        `Код авторизации: ${smsCode}\n\n` +
                        `Введите этот код на сайте для входа в систему.`
                    );
                    
                    logger.info(`Код сброса сессии отправлен в Telegram пользователю ${user.telegramUserId}: ${smsCode}`);
                }
                
                socket.emit('sessionReset');
                socket.emit('smsCodeSent', { phone });
            }
        } catch (error) {
            logger.error('Ошибка в resetSession:', error);
        }
    });
});

// Обработчики событий Telegram бота
bot.onText(/\/start (.+)/, (msg, match) => {
    const authKey = match[1];
    const userId = msg.from.id;
    const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
    
    logger.info(`Получен запрос авторизации с ключом: ${authKey} от пользователя: ${userId}`);
    
    const db = databaseService.loadDatabase();
    const authData = db.authKeys?.[authKey];
    
    if (!authData || authData.used) {
        bot.sendMessage(userId, 
            `❌ Номер ${authData?.phone || 'неизвестен'} не найден в активных запросах авторизации.\n\n` +
            `Убедитесь, что:\n` +
            `1. Вы перешли по ссылке с сайта\n` +
            `2. Номер совпадает с введенным на сайте\n` +
            `3. Запрос авторизации не устарел (действителен 5 минут)\n\n` +
            `Ссылка для авторизации: https://t.me/autor1z_bot?start=${authKey}`
        );
        return;
    }
    
    // Проверяем, не устарел ли ключ (5 минут)
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    if (now - authData.timestamp > fiveMinutes) {
        bot.sendMessage(userId, '⏰ Ключ авторизации устарел. Попробуйте снова.');
        return;
    }
    
    // Найдено совпадение
    authData.used = true;
    
    // Обновляем сессию
    const sessionData = getSessionBySocketId(authData.socketId);
    if (sessionData) {
        db.sessions[sessionData.sessionId].authorized = true;
        db.sessions[sessionData.sessionId].name = userName;
        db.sessions[sessionData.sessionId].telegramUserId = userId;
        
        // Сохраняем пользователя
        if (!db.users) db.users = {};
        db.users[authData.phone] = {
            phone: authData.phone,
            name: userName,
            telegramUserId: userId,
            lastAuth: Date.now()
        };
        
        databaseService.saveDatabase(db);
        
        // Создаем долгосрочную сессию
        const userData = {
            phone: authData.phone,
            name: userName,
            telegramUserId: userId
        };
        
        const { sessionToken, longTermSession } = createLongTermSession(userData);
        
        // Инициализируем longTermSessions если не существует
        if (!db.longTermSessions) {
            db.longTermSessions = {};
        }
        
        db.longTermSessions[sessionToken] = longTermSession;
        databaseService.saveDatabase(db);
        
        // Уведомляем клиент об успешной авторизации
        io.to(authData.socketId).emit('authSuccess', {
            phone: authData.phone,
            name: userName,
            sessionToken: sessionToken
        });
        
        bot.sendMessage(userId, 
            `✅ Авторизация успешна!\n\n` +
            `Добро пожаловать, ${userName}!\n` +
            `Номер: ${authData.phone}`
        );
        
        logger.info(`Пользователь ${authData.phone} успешно авторизован через Telegram`);
    }
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

module.exports = { app, server, io };

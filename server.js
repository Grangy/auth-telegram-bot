const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Инициализация Telegram бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Загрузка базы данных
function loadDatabase() {
    try {
        const data = fs.readFileSync('database.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { sessions: {}, authKeys: {}, users: {}, longTermSessions: {} };
    }
}

// Сохранение базы данных
function saveDatabase(db) {
    fs.writeFileSync('database.json', JSON.stringify(db, null, 2));
}

// Создание долгосрочной сессии
function createLongTermSession(userData) {
    const sessionToken = uuidv4();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 часа
    
    const longTermSession = {
        token: sessionToken,
        phone: userData.phone,
        name: userData.name,
        telegramUserId: userData.telegramUserId,
        createdAt: Date.now(),
        expiresAt: expiresAt,
        lastActivity: Date.now()
    };
    
    return { sessionToken, longTermSession };
}

// Проверка долгосрочной сессии
function validateLongTermSession(token) {
    const db = loadDatabase();
    const session = db.longTermSessions[token];
    
    if (!session) {
        return null;
    }
    
    // Проверяем, не истекла ли сессия
    if (Date.now() > session.expiresAt) {
        delete db.longTermSessions[token];
        saveDatabase(db);
        return null;
    }
    
    // Обновляем время последней активности
    session.lastActivity = Date.now();
    saveDatabase(db);
    
    return session;
}

// Продление долгосрочной сессии
function extendLongTermSession(token) {
    const db = loadDatabase();
    const session = db.longTermSessions[token];
    
    if (session) {
        session.expiresAt = Date.now() + (24 * 60 * 60 * 1000); // Продлеваем на 24 часа
        session.lastActivity = Date.now();
        saveDatabase(db);
        return true;
    }
    
    return false;
}

// Получение сессии по socket ID
function getSessionBySocketId(socketId) {
    const db = loadDatabase();
    for (const [sessionId, session] of Object.entries(db.sessions)) {
        if (session.socketId === socketId) {
            return { sessionId, session };
        }
    }
    return null;
}

// Обработка подключения Socket.IO
io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

    // Проверка существующей авторизации
    socket.on('checkAuth', (data) => {
        // Проверяем долгосрочную сессию из localStorage
        if (data && data.sessionToken) {
            const longTermSession = validateLongTermSession(data.sessionToken);
            if (longTermSession) {
                socket.emit('alreadyAuthorized', {
                    phone: longTermSession.phone,
                    name: longTermSession.name,
                    sessionToken: longTermSession.token
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
        const { phone } = data;
        const db = loadDatabase();
        
        // Проверяем, есть ли уже пользователь с таким номером
        const existingUser = Object.values(db.users).find(user => user.phone === phone);
        
        if (existingUser) {
            // Пользователь уже существует - отправляем код в Telegram
            const smsCode = Math.floor(1000 + Math.random() * 9000).toString();
            
            // Сохраняем код для проверки
            db.smsCodes = db.smsCodes || {};
            db.smsCodes[phone] = {
                code: smsCode,
                timestamp: Date.now(),
                used: false,
                socketId: socket.id
            };
            
            saveDatabase(db);
            
            // Отправляем код в Telegram существующему пользователю
            if (existingUser.telegramUserId) {
                bot.sendMessage(existingUser.telegramUserId, 
                    `🔐 Код авторизации: ${smsCode}\n\n` +
                    `Введите этот код на сайте для входа в систему.`
                );
                console.log(`Код отправлен в Telegram пользователю ${existingUser.telegramUserId}: ${smsCode}`);
            }
            
            socket.emit('smsCodeSent', { phone });
            return;
        }
        
        // Новый пользователь - создаем обычную авторизацию через Telegram
        const authKey = uuidv4().substring(0, 8);
        
        // Сохраняем ключ авторизации
        db.authKeys[authKey] = {
            phone: phone,
            socketId: socket.id,
            timestamp: Date.now(),
            used: false
        };
        
        // Создаем сессию
        const sessionId = uuidv4();
        db.sessions[sessionId] = {
            socketId: socket.id,
            phone: phone,
            authorized: false,
            timestamp: Date.now()
        };
        
        saveDatabase(db);
        
        // Создаем прямую ссылку на бота с параметром
        const botUsername = 'autor1z_bot'; // Username бота с подчеркиванием
        const authLink = `https://t.me/${botUsername}?start=${authKey}`;
        
        try {
            // Генерируем QR-код
            const qrCodeDataURL = await QRCode.toDataURL(authLink, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            
            // Отправляем QR-код клиенту
            socket.emit('authKey', { 
                key: authKey, 
                link: authLink,
                qrCode: qrCodeDataURL
            });
            
            console.log(`Создан ключ авторизации: ${authKey} для телефона: ${phone}`);
            console.log(`Ссылка для авторизации: ${authLink}`);
        } catch (error) {
            console.error('Ошибка генерации QR-кода:', error);
            // Отправляем только ссылку в случае ошибки
            socket.emit('authKey', { 
                key: authKey, 
                link: authLink
            });
        }
    });

    // Выход из системы
    socket.on('logout', () => {
        const sessionData = getSessionBySocketId(socket.id);
        if (sessionData) {
            const db = loadDatabase();
            delete db.sessions[sessionData.sessionId];
            saveDatabase(db);
            socket.emit('logoutSuccess');
            console.log(`Пользователь вышел из системы: ${socket.id}`);
        }
    });

    // Сброс сессии
    socket.on('resetSession', () => {
        const sessionData = getSessionBySocketId(socket.id);
        if (sessionData) {
            const db = loadDatabase();
            const phone = sessionData.session.phone;
            
            // Удаляем текущую сессию
            delete db.sessions[sessionData.sessionId];
            
            // Находим пользователя по номеру
            const user = Object.values(db.users).find(u => u.phone === phone);
            
            if (user && user.telegramUserId) {
                // Генерируем код
                const smsCode = Math.floor(1000 + Math.random() * 9000).toString();
                
                // Сохраняем код для проверки
                db.smsCodes = db.smsCodes || {};
                db.smsCodes[phone] = {
                    code: smsCode,
                    timestamp: Date.now(),
                    used: false,
                    socketId: socket.id
                };
                
                saveDatabase(db);
                
                // Отправляем код в Telegram
                bot.sendMessage(user.telegramUserId, 
                    `🔄 Сброс сессии\n\n` +
                    `Код авторизации: ${smsCode}\n\n` +
                    `Введите этот код на сайте для входа в систему.`
                );
                
                console.log(`Код сброса сессии отправлен в Telegram пользователю ${user.telegramUserId}: ${smsCode}`);
            }
            
            socket.emit('sessionReset');
            socket.emit('smsCodeSent', { phone });
        }
    });

    // Проверка кода авторизации
    socket.on('verifyCode', (data) => {
        const { code } = data;
        const db = loadDatabase();
        
        // Ищем активный код
        for (const [phone, codeData] of Object.entries(db.smsCodes || {})) {
            if (!codeData.used && 
                codeData.code === code && 
                codeData.socketId === socket.id) {
                
                // Проверяем, не устарел ли код (5 минут)
                const now = Date.now();
                const fiveMinutes = 5 * 60 * 1000;
                
                if (now - codeData.timestamp > fiveMinutes) {
                    socket.emit('authError', 'Код устарел. Запросите новый код.');
                    return;
                }
                
                // Код верный - авторизуем пользователя
                codeData.used = true;
                
                // Находим пользователя
                const user = Object.values(db.users).find(u => u.phone === phone);
                
                if (user) {
                    // Создаем новую сессию
                    const sessionId = uuidv4();
                    db.sessions[sessionId] = {
                        socketId: socket.id,
                        phone: phone,
                        authorized: true,
                        name: user.name,
                        telegramUserId: user.telegramUserId,
                        timestamp: Date.now()
                    };
                    
                    saveDatabase(db);
                    
                    // Создаем долгосрочную сессию
                    const userData = {
                        phone: phone,
                        name: user.name,
                        telegramUserId: user.telegramUserId
                    };
                    
                    const { sessionToken, longTermSession } = createLongTermSession(userData);
                    db.longTermSessions[sessionToken] = longTermSession;
                    saveDatabase(db);
                    
                    // Уведомляем клиент об успешной авторизации
                    socket.emit('authSuccess', {
                        phone: phone,
                        name: user.name,
                        sessionToken: sessionToken
                    });
                    
                    console.log(`Авторизация по коду успешна для ${phone} (${user.name})`);
                    return;
                }
            }
        }
        
        // Если код не найден или неверный
        socket.emit('authError', 'Неверный код. Проверьте правильность ввода.');
    });

    // Продление долгосрочной сессии
    socket.on('extendSession', (data) => {
        if (data && data.sessionToken) {
            const extended = extendLongTermSession(data.sessionToken);
            if (extended) {
                socket.emit('sessionExtended', { success: true });
                console.log(`Сессия продлена для токена: ${data.sessionToken}`);
            } else {
                socket.emit('sessionExtended', { success: false });
            }
        }
    });

    // Обработка отключения
    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
    });
});

// Обработка контактов в Telegram боте
bot.on('contact', (msg) => {
    const contact = msg.contact;
    let phoneNumber = contact.phone_number;
    const userId = msg.from.id;
    const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
    
    // Нормализуем номер телефона (добавляем + если его нет)
    if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
    }
    
    console.log(`Получен контакт от пользователя ${userId}: ${phoneNumber}`);
    
    const db = loadDatabase();
    
    // Ищем активные ключи авторизации для этого пользователя
    for (const [authKey, authData] of Object.entries(db.authKeys)) {
        if (!authData.used && 
            authData.telegramUserId === userId && 
            authData.phone === phoneNumber) {
            
            // Найдено совпадение
            authData.used = true;
            
            // Обновляем сессию
            const sessionData = getSessionBySocketId(authData.socketId);
            if (sessionData) {
                db.sessions[sessionData.sessionId].authorized = true;
                db.sessions[sessionData.sessionId].name = userName;
                db.sessions[sessionData.sessionId].telegramUserId = userId;
                
                // Сохраняем пользователя
                db.users[userId] = {
                    phone: phoneNumber,
                    name: userName,
                    telegramUserId: userId,
                    lastAuth: Date.now()
                };
                
                saveDatabase(db);
                
                    // Создаем долгосрочную сессию
                    const userData = {
                        phone: phoneNumber,
                        name: userName,
                        telegramUserId: userId
                    };
                    
                    const { sessionToken, longTermSession } = createLongTermSession(userData);
                    db.longTermSessions[sessionToken] = longTermSession;
                    saveDatabase(db);
                    
                    // Уведомляем клиент об успешной авторизации
                    io.to(authData.socketId).emit('authSuccess', {
                        phone: phoneNumber,
                        name: userName,
                        sessionToken: sessionToken
                    });
                
                // Отправляем подтверждение в Telegram
                bot.sendMessage(userId, `✅ Авторизация успешна! Добро пожаловать, ${userName}!`);
                
                console.log(`Авторизация успешна для ${phoneNumber} (${userName})`);
                return;
            }
        }
    }
    
    // Если совпадение не найдено
    bot.sendMessage(userId, 
        `❌ Номер ${phoneNumber} не найден в активных запросах авторизации.\n\n` +
        `Убедитесь, что:\n` +
        `1. Вы перешли по ссылке с сайта\n` +
        `2. Номер совпадает с введенным на сайте\n` +
        `3. Запрос авторизации не устарел (действителен 5 минут)`
    );
});

// Обработка команды /start с параметром
bot.onText(/\/start (.+)/, (msg, match) => {
    const userId = msg.from.id;
    const authKey = match[1];
    const db = loadDatabase();
    
    console.log(`Получен запрос авторизации с ключом: ${authKey} от пользователя: ${userId}`);
    
    // Проверяем существование ключа
    if (db.authKeys[authKey] && !db.authKeys[authKey].used) {
        const authData = db.authKeys[authKey];
        
        // Сохраняем информацию о пользователе для проверки
        db.authKeys[authKey].telegramUserId = userId;
        db.authKeys[authKey].telegramUsername = msg.from.username;
        saveDatabase(db);
        
        // Создаем inline клавиатуру с кнопкой для запроса контакта
        const keyboard = {
            reply_markup: {
                keyboard: [
                    [{
                        text: "📱 Поделиться контактом",
                        request_contact: true
                    }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        };

        bot.sendMessage(userId, 
            `🔐 Авторизация\n\n` +
            `Ключ: ${authKey}\n` +
            `Ожидаемый номер: ${authData.phone}\n\n` +
            `Для завершения авторизации нажмите кнопку ниже или напишите номер телефона:`,
            keyboard
        );
    } else {
        bot.sendMessage(userId, 
            `❌ Неверный или устаревший ключ авторизации\n\n` +
            `Получите новую ссылку на сайте`
        );
    }
});

// Обработка команды /start без параметра
bot.onText(/\/start$/, (msg) => {
    const userId = msg.from.id;
    bot.sendMessage(userId, 
        `🤖 Бот авторизации\n\n` +
        `Для авторизации перейдите по ссылке с сайта\n\n` +
        `Ваш ID: ${userId}`
    );
});

// Обработка текстовых сообщений (номера телефонов и SMS коды)
bot.on('message', (msg) => {
    // Пропускаем команды и контакты
    if (msg.text && msg.text.startsWith('/')) return;
    if (msg.contact) return;
    
    const userId = msg.from.id;
    const messageText = msg.text;
    
    // Проверяем, является ли сообщение SMS кодом (4 цифры)
    if (messageText && messageText.match(/^\d{4}$/)) {
        const smsCode = messageText;
        console.log(`Получен SMS код от пользователя ${userId}: ${smsCode}`);
        
        const db = loadDatabase();
        
        // Ищем активный SMS код
        for (const [phone, codeData] of Object.entries(db.smsCodes || {})) {
            if (!codeData.used && codeData.code === smsCode) {
                // Проверяем, не устарел ли код (5 минут)
                const now = Date.now();
                const fiveMinutes = 5 * 60 * 1000;
                
                if (now - codeData.timestamp > fiveMinutes) {
                    bot.sendMessage(userId, `❌ SMS код устарел. Запросите новый код.`);
                    continue;
                }
                
                // Код верный - авторизуем пользователя
                codeData.used = true;
                
                // Создаем новую сессию
                const sessionId = uuidv4();
                db.sessions[sessionId] = {
                    socketId: null, // Нет активного socket соединения
                    phone: phone,
                    authorized: true,
                    name: msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : ''),
                    telegramUserId: userId,
                    timestamp: Date.now()
                };
                
                // Обновляем информацию о пользователе
                db.users[userId] = {
                    phone: phone,
                    name: msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : ''),
                    telegramUserId: userId,
                    lastAuth: Date.now()
                };
                
                saveDatabase(db);
                
                // Отправляем подтверждение в Telegram
                bot.sendMessage(userId, `✅ Авторизация успешна! Добро пожаловать, ${msg.from.first_name}!`);
                
                console.log(`SMS авторизация успешна для ${phone} (${msg.from.first_name})`);
                return;
            }
        }
        
        // Если код не найден или неверный
        bot.sendMessage(userId, 
            `❌ Неверный SMS код.\n\n` +
            `Убедитесь, что:\n` +
            `1. Код введен правильно (4 цифры)\n` +
            `2. Код не устарел (действителен 5 минут)\n` +
            `3. Вы запросили код на сайте`
        );
        return;
    }
    
    // Проверяем, является ли сообщение номером телефона
    if (messageText && messageText.match(/^\+?[1-9]\d{1,14}$/)) {
        const phoneNumber = messageText.startsWith('+') ? messageText : '+' + messageText;
        
        console.log(`Получен номер телефона от пользователя ${userId}: ${phoneNumber}`);
        
        const db = loadDatabase();
        
        // Ищем активные ключи авторизации для этого пользователя
        for (const [authKey, authData] of Object.entries(db.authKeys)) {
            if (!authData.used && 
                authData.telegramUserId === userId && 
                authData.phone === phoneNumber) {
                
                // Найдено совпадение
                authData.used = true;
                
                // Обновляем сессию
                const sessionData = getSessionBySocketId(authData.socketId);
                if (sessionData) {
                    db.sessions[sessionData.sessionId].authorized = true;
                    db.sessions[sessionData.sessionId].name = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
                    db.sessions[sessionData.sessionId].telegramUserId = userId;
                    
                    // Сохраняем пользователя
                    db.users[userId] = {
                        phone: phoneNumber,
                        name: msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : ''),
                        telegramUserId: userId,
                        lastAuth: Date.now()
                    };
                    
                    saveDatabase(db);
                    
                    // Создаем долгосрочную сессию
                    const userData = {
                        phone: phoneNumber,
                        name: msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : ''),
                        telegramUserId: userId
                    };
                    
                    const { sessionToken, longTermSession } = createLongTermSession(userData);
                    db.longTermSessions[sessionToken] = longTermSession;
                    saveDatabase(db);
                    
                    // Уведомляем клиент об успешной авторизации
                    io.to(authData.socketId).emit('authSuccess', {
                        phone: phoneNumber,
                        name: msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : ''),
                        sessionToken: sessionToken
                    });
                    
                    // Отправляем подтверждение в Telegram
                    bot.sendMessage(userId, `✅ Авторизация успешна! Добро пожаловать!`);
                    
                    console.log(`Авторизация успешна для ${phoneNumber} (${msg.from.first_name})`);
                    return;
                }
            }
        }
        
        // Если совпадение не найдено
        bot.sendMessage(userId, 
            `❌ Номер ${phoneNumber} не найден в активных запросах авторизации.\n\n` +
            `Убедитесь, что:\n` +
            `1. Вы перешли по ссылке с сайта\n` +
            `2. Номер совпадает с введенным на сайте\n` +
            `3. Запрос авторизации не устарел (действителен 5 минут)`
        );
    }
});

// Обработка ошибок бота
bot.on('error', (error) => {
    console.error('Ошибка Telegram бота:', error);
});

bot.on('polling_error', (error) => {
    console.error('Ошибка polling Telegram бота:', error);
});

// Очистка старых ключей авторизации и SMS кодов (каждые 5 минут)
setInterval(() => {
    const db = loadDatabase();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    let cleaned = false;
    
    // Очистка устаревших ключей авторизации
    for (const [authKey, authData] of Object.entries(db.authKeys)) {
        if (now - authData.timestamp > fiveMinutes) {
            delete db.authKeys[authKey];
            cleaned = true;
        }
    }
    
    // Очистка устаревших SMS кодов
    if (db.smsCodes) {
        for (const [phone, codeData] of Object.entries(db.smsCodes)) {
            if (now - codeData.timestamp > fiveMinutes) {
                delete db.smsCodes[phone];
                cleaned = true;
            }
        }
    }
    
    if (cleaned) {
        saveDatabase(db);
        console.log('Очищены устаревшие ключи авторизации и SMS коды');
    }
}, 5 * 60 * 1000);

// Запуск сервера
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📱 Telegram бот активен`);
    console.log(`🌐 Откройте http://localhost:${PORT} в браузере`);
});

// Обработка завершения процесса
process.on('SIGINT', () => {
    console.log('\n🛑 Завершение работы сервера...');
    bot.stopPolling();
    server.close(() => {
        console.log('✅ Сервер остановлен');
        process.exit(0);
    });
});

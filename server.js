const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

// Импорт наших модулей
const config = require('./src/config/config');
const logger = require('./src/utils/logger');
const PrismaService = require('./src/services/PrismaService');
const CacheService = require('./src/services/CacheService');
const TelegramService = require('./src/services/TelegramService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Инициализация сервисов
let prismaService, cacheService, telegramService;

// Проверяем доступность MongoDB
const DATABASE_URL = process.env.DATABASE_URL || "mongodb+srv://username:password@cluster.mongodb.net/telegram-auth?retryWrites=true&w=majority";

if (DATABASE_URL.includes('username:password')) {
    console.log('⚠️  MongoDB не настроен. Запуск в режиме без базы данных...');
    // Запускаем без Prisma
    prismaService = null;
    cacheService = null;
} else {
    prismaService = new PrismaService();
    cacheService = new CacheService();
}

telegramService = new TelegramService();

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

// Получение сессии по socket ID с кэшированием
async function getSessionBySocketId(socketId) {
    try {
        if (!prismaService || !cacheService) {
            // Режим без базы данных - возвращаем null
            return null;
        }
        
        // Сначала проверяем кэш
        let session = await cacheService.getSessionBySocketId(socketId);
        
        if (!session) {
            // Если нет в кэше, ищем в базе данных
            session = await prismaService.findSessionBySocketId(socketId);
            
            if (session) {
                // Прогреваем кэш
                await cacheService.warmSessionCache(session);
            }
        }
        
        return session;
    } catch (error) {
        logger.error('Ошибка получения сессии:', error);
        return null;
    }
}

// Обработка подключения Socket.IO
io.on('connection', (socket) => {
    logger.info('Пользователь подключился', { socketId: socket.id });
    
    // Обработка отключения
    socket.on('disconnect', async () => {
        logger.info('Пользователь отключился', { socketId: socket.id });
        
        // НЕ очищаем сессию при отключении - пользователь может переподключиться
        const sessionData = await getSessionBySocketId(socket.id);
        if (sessionData) {
            logger.info(`Сессия ${sessionData.id} сохранена для переподключения`);
        }
    });

    // Проверка существующей авторизации
    socket.on('checkAuth', async (data) => {
        try {
            if (data && data.sessionToken) {
                // Проверяем долгосрочную сессию
                let longTermSession = await cacheService.getLongTermSession(data.sessionToken);
                
                if (!longTermSession) {
                    longTermSession = await prismaService.findLongTermSession(data.sessionToken);
                    if (longTermSession) {
                        await cacheService.setLongTermSession(data.sessionToken, longTermSession);
                    }
                }
                
                if (longTermSession && longTermSession.expiresAt > new Date()) {
                    socket.emit('alreadyAuthorized', {
                        phone: longTermSession.phone,
                        name: longTermSession.name
                    });
                    return;
                }
            }
            
            // Проверяем обычную сессию
            const sessionData = await getSessionBySocketId(socket.id);
            if (sessionData && sessionData.authorized) {
                socket.emit('alreadyAuthorized', {
                    phone: sessionData.phone,
                    name: sessionData.name
                });
            }
        } catch (error) {
            logger.error('Ошибка проверки авторизации:', error);
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
            
            if (!prismaService || !cacheService) {
                socket.emit('authError', { message: 'База данных не настроена. Обратитесь к администратору.' });
                return;
            }
            
            // Проверяем кэш пользователя
            let user = await cacheService.getUserByPhone(phone);
            
            if (!user) {
                // Если нет в кэше, ищем в базе данных
                user = await prismaService.findUserByPhone(phone);
                
                if (user) {
                    // Прогреваем кэш
                    await cacheService.warmUserCache(user);
                }
            }
            
            if (user && user.telegramUserId) {
                // Пользователь уже существует, отправляем SMS код
                const smsCode = Math.floor(1000 + Math.random() * 9000).toString();
                const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 минут
                
                // Сохраняем код в базу данных
                await prismaService.createSmsCode({
                    phone: phone,
                    code: smsCode,
                    socketId: socket.id,
                    expiresAt: expiresAt
                });
                
                // Кэшируем код
                await cacheService.setSmsCode(phone, {
                    code: smsCode,
                    socketId: socket.id,
                    expiresAt: expiresAt
                });
                
                // Отправляем код в Telegram
                await telegramService.sendMessage(user.telegramUserId, 
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
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 минут
            
            // Сохраняем ключ авторизации в базу данных
            await prismaService.createAuthKey({
                key: authKey,
                phone: phone,
                socketId: socket.id,
                expiresAt: expiresAt
            });
            
            // Кэшируем ключ
            await cacheService.setAuthKey(authKey, {
                phone: phone,
                socketId: socket.id,
                expiresAt: expiresAt
            });
            
            // Создаем сессию
            const sessionExpiresAt = new Date(Date.now() + config.session.maxAge);
            await prismaService.createSession({
                socketId: socket.id,
                phone: phone,
                authorized: false,
                expiresAt: sessionExpiresAt
            });
            
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
    socket.on('verifyCode', async (data) => {
        try {
            const { phone, code } = data;
            if (!phone || !code) {
                socket.emit('authError', { message: 'Не указан номер телефона или код' });
                return;
            }

            // Проверяем кэш SMS кода
            let codeData = await cacheService.getSmsCode(phone);
            
            if (!codeData) {
                // Если нет в кэше, ищем в базе данных
                codeData = await prismaService.findSmsCode(phone);
            }
            
            if (!codeData || codeData.used || codeData.code !== code) {
                socket.emit('authError', { message: 'Неверный код' });
                return;
            }

            // Проверяем, не устарел ли код
            if (new Date() > codeData.expiresAt) {
                socket.emit('authError', { message: 'Код устарел' });
                return;
            }

            // Код верный, помечаем как использованный
            await prismaService.markSmsCodeAsUsed(phone);
            await cacheService.invalidateSmsCode(phone);

            // Находим пользователя
            let user = await cacheService.getUserByPhone(phone);
            if (!user) {
                user = await prismaService.findUserByPhone(phone);
            }
            
            if (!user) {
                socket.emit('authError', { message: 'Пользователь не найден' });
                return;
            }

            // Создаем новую сессию
            const sessionExpiresAt = new Date(Date.now() + config.session.maxAge);
            await prismaService.updateSession(socket.id, {
                authorized: true,
                name: user.name,
                telegramUserId: user.telegramUserId,
                expiresAt: sessionExpiresAt
            });

            // Создаем долгосрочную сессию
            const userData = {
                phone: phone,
                name: user.name,
                telegramUserId: user.telegramUserId
            };
            
            const longTermSessionData = createLongTermSession(userData);
            await prismaService.createLongTermSession(longTermSessionData);
            
            // Кэшируем долгосрочную сессию
            await cacheService.setLongTermSession(longTermSessionData.token, longTermSessionData);

            // Уведомляем клиент об успешной авторизации
            socket.emit('authSuccess', {
                phone: phone,
                name: user.name,
                sessionToken: longTermSessionData.token
            });

            logger.info(`Пользователь ${phone} успешно авторизован`);

        } catch (error) {
            logger.error('Ошибка в verifyCode:', error);
            socket.emit('authError', { message: 'Внутренняя ошибка сервера' });
        }
    });

    // Выход из системы
    socket.on('logout', async () => {
        try {
            const sessionData = await getSessionBySocketId(socket.id);
            if (sessionData) {
                await prismaService.deleteSession(socket.id);
                await cacheService.invalidateSession(socket.id);
                socket.emit('logoutSuccess');
                logger.info(`Пользователь вышел из системы: ${socket.id}`);
            }
        } catch (error) {
            logger.error('Ошибка в logout:', error);
        }
    });

    // Сброс сессии
    socket.on('resetSession', async () => {
        try {
            const sessionData = await getSessionBySocketId(socket.id);
            if (sessionData) {
                const phone = sessionData.phone;
                
                // Удаляем текущую сессию
                await prismaService.deleteSession(socket.id);
                await cacheService.invalidateSession(socket.id);
                
                // Находим пользователя по номеру
                let user = await cacheService.getUserByPhone(phone);
                if (!user) {
                    user = await prismaService.findUserByPhone(phone);
                }
                
                if (user && user.telegramUserId) {
                    // Генерируем код
                    const smsCode = Math.floor(1000 + Math.random() * 9000).toString();
                    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
                    
                    // Сохраняем код для проверки
                    await prismaService.createSmsCode({
                        phone: phone,
                        code: smsCode,
                        socketId: socket.id,
                        expiresAt: expiresAt
                    });
                    
                    // Кэшируем код
                    await cacheService.setSmsCode(phone, {
                        code: smsCode,
                        socketId: socket.id,
                        expiresAt: expiresAt
                    });
                    
                    // Отправляем код в Telegram
                    await telegramService.sendMessage(user.telegramUserId, 
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
bot.onText(/\/start (.+)/, async (msg, match) => {
    const authKey = match[1];
    const userId = msg.from.id;
    const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
    
    logger.info(`Получен запрос авторизации с ключом: ${authKey} от пользователя: ${userId}`);
    
    try {
        // Проверяем кэш ключа
        let authData = await cacheService.getAuthKey(authKey);
        
        if (!authData) {
            // Если нет в кэше, ищем в базе данных
            authData = await prismaService.findAuthKey(authKey);
        }
        
        if (!authData || authData.used) {
            await bot.sendMessage(userId, 
                `❌ Номер ${authData?.phone || 'неизвестен'} не найден в активных запросах авторизации.\n\n` +
                `Убедитесь, что:\n` +
                `1. Вы перешли по ссылке с сайта\n` +
                `2. Номер совпадает с введенным на сайте\n` +
                `3. Запрос авторизации не устарел (действителен 5 минут)\n\n` +
                `Ссылка для авторизации: https://t.me/autor1z_bot?start=${authKey}`
            );
            return;
        }
        
        // Проверяем, не устарел ли ключ
        if (new Date() > authData.expiresAt) {
            await bot.sendMessage(userId, '⏰ Ключ авторизации устарел. Попробуйте снова.');
            return;
        }
        
        // Найдено совпадение, помечаем как использованный
        await prismaService.markAuthKeyAsUsed(authKey);
        await cacheService.invalidateAuthKey(authKey);
        
        // Обновляем сессию
        const sessionData = await getSessionBySocketId(authData.socketId);
        if (sessionData) {
            await prismaService.updateSession(authData.socketId, {
                authorized: true,
                name: userName,
                telegramUserId: userId
            });
            
            // Сохраняем/обновляем пользователя
            let user = await prismaService.findUserByPhone(authData.phone);
            if (user) {
                await prismaService.updateUser(authData.phone, {
                    name: userName,
                    telegramUserId: userId,
                    lastAuth: new Date()
                });
            } else {
                user = await prismaService.createUser({
                    phone: authData.phone,
                    name: userName,
                    telegramUserId: userId,
                    lastAuth: new Date()
                });
            }
            
            // Прогреваем кэш пользователя
            await cacheService.warmUserCache(user);
            
            // Создаем долгосрочную сессию
            const userData = {
                phone: authData.phone,
                name: userName,
                telegramUserId: userId
            };
            
            const longTermSessionData = createLongTermSession(userData);
            await prismaService.createLongTermSession(longTermSessionData);
            await cacheService.setLongTermSession(longTermSessionData.token, longTermSessionData);
            
            // Уведомляем клиент об успешной авторизации
            io.to(authData.socketId).emit('authSuccess', {
                phone: authData.phone,
                name: userName,
                sessionToken: longTermSessionData.token
            });
            
            await bot.sendMessage(userId, 
                `✅ Авторизация успешна!\n\n` +
                `Добро пожаловать, ${userName}!\n` +
                `Номер: ${authData.phone}`
            );
            
            logger.info(`Пользователь ${authData.phone} успешно авторизован через Telegram`);
        }
    } catch (error) {
        logger.error('Ошибка обработки авторизации через Telegram:', error);
    }
});

// Периодическая очистка старых данных
setInterval(async () => {
    try {
        await prismaService.cleanupExpiredSessions();
        await prismaService.cleanupExpiredSmsCodes();
        await prismaService.cleanupExpiredAuthKeys();
    } catch (error) {
        logger.error('Ошибка очистки устаревших данных:', error);
    }
}, config.session.cleanupInterval);

// Инициализация сервера
async function startServer() {
    try {
        // Подключаемся к базе данных если она настроена
        if (prismaService) {
            await prismaService.connect();
            logger.info('✅ База данных подключена');
        } else {
            logger.warn('⚠️  База данных не настроена - работаем в ограниченном режиме');
        }
        
        // Запускаем сервер
        server.listen(config.port, () => {
            logger.info(`🚀 Сервер запущен на порту ${config.port}`);
            logger.info(`📱 Telegram бот активен`);
            logger.info(`🌐 Откройте http://localhost:${config.port} в браузере`);
            
            if (!prismaService) {
                logger.warn('⚠️  Для полной функциональности настройте MongoDB Atlas');
                logger.info('📝 Инструкция: https://www.mongodb.com/atlas');
            }
        });
    } catch (error) {
        logger.error('Ошибка запуска сервера:', error);
        process.exit(1);
    }
}

// Обработка завершения процесса
process.on('SIGINT', async () => {
    logger.info('🛑 Завершение работы сервера...');
    telegramService.stopPolling();
    await prismaService.disconnect();
    server.close(() => {
        logger.info('✅ Сервер остановлен');
        process.exit(0);
    });
});

// Запускаем сервер
startServer();

module.exports = { app, server, io };

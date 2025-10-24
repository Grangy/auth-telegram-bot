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
const StartupChecklist = require('./src/utils/startupChecklist');
const SystemChecks = require('./src/utils/systemChecks');
const errorHandler = require('./src/middleware/errorHandler');

// Обработка аргументов командной строки
const args = process.argv.slice(2);
const shouldClearDatabase = args.includes('--clear-db') || args.includes('--clear-database');
const shouldResetUsers = args.includes('--reset-users');
const shouldResetAll = args.includes('--reset-all');

// Показываем справку по параметрам
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🚀 Telegram Authorization Server

Использование:
  node server.js [опции]

Опции:
  --clear-db, --clear-database    Очистить всю базу данных
  --reset-users                   Очистить только пользователей и сессии
  --reset-all                     Очистить все данные (аналог --clear-db)
  --help, -h                      Показать эту справку

Примеры:
  node server.js                  # Обычный запуск
  node server.js --clear-db       # Очистить БД и запустить
  node server.js --reset-users    # Очистить только пользователей
  node server.js --help           # Показать справку
`);
    process.exit(0);
}

// Показываем активные параметры
if (shouldClearDatabase || shouldResetUsers || shouldResetAll) {
    console.log('🧹 Параметры очистки активированы:');
    if (shouldClearDatabase || shouldResetAll) {
        console.log('   - Очистка всей базы данных');
    }
    if (shouldResetUsers) {
        console.log('   - Очистка пользователей');
    }
    console.log('');
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Инициализация сервисов
let prismaService, cacheService, telegramService;
let systemChecks, startupChecklist;

// Бот будет инициализирован после проверок
let bot;

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
            logger.info(`Проверка авторизации для socket ${socket.id}:`, { hasData: !!data, hasSessionToken: !!(data && data.sessionToken) });
            if (data && data.sessionToken) {
                // Проверяем долгосрочную сессию
                let longTermSession = null;
                
                try {
                    longTermSession = await cacheService.getLongTermSession(data.sessionToken);
                } catch (error) {
                    logger.warn('Ошибка получения сессии из кэша:', error);
                }
                
                if (!longTermSession) {
                    try {
                        longTermSession = await prismaService.findLongTermSession(data.sessionToken);
                        if (longTermSession) {
                            await cacheService.setLongTermSession(data.sessionToken, longTermSession);
                        }
                    } catch (error) {
                        logger.error('Ошибка поиска долгосрочной сессии в БД:', error);
                    }
                }
                
                if (longTermSession && new Date(longTermSession.expiresAt) > new Date()) {
                    logger.info(`Найдена валидная долгосрочная сессия для ${longTermSession.phone}, срок действия: ${longTermSession.expiresAt}`);
                    // Создаем новую сессию для текущего socket с данными из долгосрочной сессии
                    const sessionExpiresAt = new Date(Date.now() + config.session.maxAge);
                    
                    try {
                        await prismaService.createSession({
                            socketId: socket.id,
                            phone: longTermSession.phone,
                            authorized: true,
                            name: longTermSession.name,
                            telegramUserId: longTermSession.telegramUserId,
                            expiresAt: sessionExpiresAt
                        });
                        
                        // Кэшируем новую сессию
                        await cacheService.warmSessionCache({
                            socketId: socket.id,
                            phone: longTermSession.phone,
                            authorized: true,
                            name: longTermSession.name,
                            telegramUserId: longTermSession.telegramUserId,
                            expiresAt: sessionExpiresAt
                        });
                        
                        socket.emit('alreadyAuthorized', {
                            phone: longTermSession.phone,
                            name: longTermSession.name,
                            sessionToken: data.sessionToken
                        });
                        logger.info(`Сессия восстановлена для пользователя ${longTermSession.phone} с socket ${socket.id}`);
                        return;
                    } catch (error) {
                        logger.error('Ошибка создания сессии при восстановлении:', error);
                        socket.emit('authError', { message: 'Ошибка восстановления сессии' });
                        return;
                    }
                } else {
                    logger.info(`Долгосрочная сессия не найдена или устарела:`, { 
                        found: !!longTermSession, 
                        expiresAt: longTermSession?.expiresAt,
                        currentTime: new Date(),
                        isExpired: longTermSession ? new Date() > new Date(longTermSession.expiresAt) : true
                    });
                    
                    // Если сессия устарела, удаляем её
                    if (longTermSession && new Date() > new Date(longTermSession.expiresAt)) {
                        try {
                            await prismaService.deleteLongTermSession(data.sessionToken);
                            await cacheService.invalidateLongTermSession(data.sessionToken);
                            logger.info(`Устаревшая долгосрочная сессия удалена: ${data.sessionToken}`);
                        } catch (error) {
                            logger.error('Ошибка удаления устаревшей сессии:', error);
                        }
                    }
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
            const botUsername = config.botUsername || 'autor1z_bot';
            const authLink = `https://t.me/${botUsername}?start=${authKey}`;
            
            logger.info(`Генерируем ссылку авторизации: ${authLink}`);
            
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
                phone: phone,
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

// Обработчики событий Telegram бота (будут инициализированы после проверок)
function setupTelegramHandlers() {
    // Обработчик команды /start без параметров
    bot.onText(/\/start$/, async (msg) => {
        const userId = msg.from.id;
        const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
        
        logger.info(`Пользователь ${userName} (${userId}) запустил бота без параметров`);
        
        const welcomeMessage = `👋 Привет, ${userName}!\n\n` +
            `🔐 Для авторизации в системе:\n\n` +
            `1️⃣ Перейдите на сайт авторизации\n` +
            `2️⃣ Введите ваш номер телефона\n` +
            `3️⃣ Нажмите кнопку "Получить код"\n` +
            `4️⃣ Перейдите по ссылке из QR-кода\n\n` +
            `📱 Или поделитесь контактом для быстрой авторизации:`;
        
        const contactKeyboard = {
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
        
        await bot.sendMessage(userId, welcomeMessage, contactKeyboard);
    });
    
    // Обработчик команды /start с параметром
    bot.onText(/\/start (.+)/, async (msg, match) => {
    const authKey = match[1];
    const userId = msg.from.id;
    const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
    
    logger.info(`Получен запрос авторизации с ключом: ${authKey} от пользователя: ${userId}`);
    logger.info(`Ссылка для авторизации: https://t.me/autor1z_bot?start=${authKey}`);
    
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
        
        // КРИТИЧЕСКАЯ ПРОВЕРКА: Требуем контакт для верификации номера телефона
        await bot.sendMessage(userId, 
            `🔐 Авторизация для номера: ${authData.phone}\n\n` +
            `Для завершения авторизации необходимо подтвердить номер телефона.\n\n` +
            `📱 Пожалуйста, поделитесь контактом, нажав кнопку ниже:`,
            {
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
            }
        );
        
        // Сохраняем данные авторизации для последующей проверки контакта
        await cacheService.setAuthKey(authKey, {
            ...authData,
            pendingUserId: userId,
            pendingUserName: userName
        });
        
        logger.info(`Требуется подтверждение контакта для пользователя ${userId} с номером ${authData.phone}`);
        
    } catch (error) {
        logger.error('Ошибка обработки авторизации через Telegram:', error);
    }
    });
    
    // Обработчик получения контакта
    bot.on('contact', async (msg) => {
        const userId = msg.from.id;
        const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
        const contact = msg.contact;
        
        logger.info(`Получен контакт от пользователя ${userName} (${userId}): ${contact.phone_number}`);
        
        try {
            // Нормализуем номер телефона
            const normalizedPhone = contact.phone_number.startsWith('+') ? 
                contact.phone_number : `+${contact.phone_number}`;
            
            // Ищем активные запросы авторизации для этого номера
            const activeAuthKeys = await prismaService.findActiveAuthKeysByPhone(normalizedPhone);
            
            if (!activeAuthKeys || activeAuthKeys.length === 0) {
                await bot.sendMessage(userId, 
                    `❌ Не найдено активных запросов авторизации для номера ${normalizedPhone}.\n\n` +
                    `Убедитесь, что:\n` +
                    `1. Вы перешли по ссылке с сайта\n` +
                    `2. Номер совпадает с введенным на сайте\n` +
                    `3. Запрос авторизации не устарел`
                );
                return;
            }
            
            // Берем первый активный ключ
            const authKey = activeAuthKeys[0];
            const pendingAuth = {
                key: authKey.key,
                phone: authKey.phone,
                socketId: authKey.socketId,
                expiresAt: authKey.expiresAt
            };
            
            // Проверяем, не устарел ли ключ
            if (new Date() > pendingAuth.expiresAt) {
                await bot.sendMessage(userId, '⏰ Ключ авторизации устарел. Попробуйте снова.');
                return;
            }
            
            // Помечаем ключ как использованный
            await prismaService.markAuthKeyAsUsed(pendingAuth.key);
            await cacheService.invalidateAuthKey(pendingAuth.key);
            
            // Обновляем сессию
            const sessionData = await getSessionBySocketId(pendingAuth.socketId);
            if (sessionData) {
                await prismaService.updateSession(pendingAuth.socketId, {
                    phone: normalizedPhone,
                    authorized: true,
                    name: userName,
                    telegramUserId: userId.toString()
                });
                
                // Сохраняем/обновляем пользователя
                let user = await prismaService.findUserByPhone(normalizedPhone);
                if (user) {
                    await prismaService.updateUser(normalizedPhone, {
                        name: userName,
                        telegramUserId: userId.toString(),
                        lastAuth: new Date()
                    });
                } else {
                    user = await prismaService.createUser({
                        phone: normalizedPhone,
                        name: userName,
                        telegramUserId: userId.toString(),
                        lastAuth: new Date()
                    });
                }
                
                // Прогреваем кэш пользователя
                await cacheService.warmUserCache(user);
                
                // Создаем долгосрочную сессию
                const longTermSessionData = createLongTermSession({
                    phone: normalizedPhone,
                    name: userName,
                    telegramUserId: userId.toString()
                });
                await prismaService.createLongTermSession(longTermSessionData);
                await cacheService.setLongTermSession(longTermSessionData.token, longTermSessionData);
                
                // Уведомляем клиент об успешной авторизации
                io.to(pendingAuth.socketId).emit('authSuccess', {
                    phone: normalizedPhone,
                    name: userName,
                    sessionToken: longTermSessionData.token
                });
                
                await bot.sendMessage(userId, 
                    `✅ Авторизация успешна!\n\n` +
                    `Добро пожаловать, ${userName}!\n` +
                    `Номер: ${normalizedPhone}`
                );
                
                logger.info(`Пользователь ${normalizedPhone} успешно авторизован через контакт`);
            } else {
                await bot.sendMessage(userId, 
                    `❌ Сессия не найдена. Пожалуйста, перейдите по ссылке с сайта.`
                );
            }
        } catch (error) {
            logger.error('Ошибка обработки контакта:', error);
            await bot.sendMessage(userId, 
                `❌ Произошла ошибка при обработке контакта. Попробуйте позже.`
            );
        }
    });
}

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

// Инициализация сервера с проверками
async function startServer() {
    try {
        // Инициализируем систему проверок
        systemChecks = new SystemChecks();
        startupChecklist = new StartupChecklist();

        // Добавляем проверки
        startupChecklist.addCheck(
            'Переменные окружения',
            () => systemChecks.checkEnvironmentVariables(),
            true
        );

        startupChecklist.addCheck(
            'Подключение к базе данных',
            () => systemChecks.checkDatabaseConnection(),
            true
        );

        startupChecklist.addCheck(
            'Структура базы данных',
            () => systemChecks.checkDatabaseSchema(),
            true
        );

        startupChecklist.addCheck(
            'Redis подключение',
            () => systemChecks.checkRedisConnection(),
            false // Redis не критичен
        );

        startupChecklist.addCheck(
            'Telegram бот',
            () => systemChecks.checkTelegramBot(),
            true
        );

        startupChecklist.addCheck(
            'Файловая система',
            () => systemChecks.checkFileSystem(),
            true
        );

        startupChecklist.addCheck(
            'Проверка портов',
            () => systemChecks.checkPorts(),
            true
        );

        startupChecklist.addCheck(
            'Зависимости',
            () => systemChecks.checkDependencies(),
            true
        );

        // Выполняем все проверки
        const checksPassed = await startupChecklist.runChecks();
        
        if (!checksPassed) {
            logger.error('💥 Критические ошибки обнаружены. Сервер не может быть запущен.');
            process.exit(1);
        }

        // Инициализируем сервисы после успешных проверок
        prismaService = new PrismaService();
        cacheService = new CacheService();
        telegramService = new TelegramService();

        // Проверяем статус кэша и логируем информацию
        setTimeout(() => {
            const cacheStatus = cacheService.getCacheStatus();
            if (cacheStatus.isConnected) {
                logger.info('✅ Redis кэш подключен');
            } else {
                logger.warn(`⚠️ Redis недоступен, используется fallback кэш (размер: ${cacheStatus.fallbackCacheSize})`);
            }
        }, 2000);

        // Получаем экземпляр бота для обработки событий
        bot = telegramService.getBot();
        
        // Настраиваем обработчики Telegram бота
        setupTelegramHandlers();

        // Подключаемся к базе данных
        await prismaService.connect();
        logger.info('✅ База данных подключена');
        
        // Очистка базы данных при необходимости
        if (shouldClearDatabase || shouldResetAll) {
            logger.warn('🧹 Режим очистки базы данных активирован');
            const result = await prismaService.clearAllData();
            logger.warn(`✅ Очистка завершена. Удалено записей: ${JSON.stringify(result)}`);
        } else if (shouldResetUsers) {
            logger.warn('🧹 Режим очистки пользователей активирован');
            const result = await prismaService.clearUsers();
            logger.warn(`✅ Очистка пользователей завершена. Удалено записей: ${JSON.stringify(result)}`);
        }
        
        // Запускаем сервер
        server.listen(config.port, () => {
            logger.info(`🚀 Сервер запущен на порту ${config.port}`);
            logger.info(`📱 Telegram бот активен`);
            logger.info(`🌐 Откройте http://localhost:${config.port} в браузере`);
            logger.info(`✅ Все системы работают корректно`);
        });
    } catch (error) {
        logger.error('Ошибка запуска сервера:', error);
        process.exit(1);
    }
}

// Глобальная обработка ошибок
process.on('uncaughtException', (error) => {
    logger.error('💥 Необработанное исключение:', error);
    errorHandler.handleCriticalError(error, 'uncaughtException');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Необработанное отклонение промиса:', { reason, promise });
    errorHandler.handleCriticalError(reason, 'unhandledRejection');
});

// Обработка завершения процесса
process.on('SIGINT', async () => {
    logger.info('🛑 Завершение работы сервера...');
    try {
        if (telegramService) {
            telegramService.stopPolling();
        }
        if (prismaService) {
            await prismaService.disconnect();
        }
        server.close(() => {
            logger.info('✅ Сервер остановлен');
            process.exit(0);
        });
    } catch (error) {
        logger.error('Ошибка при завершении работы:', error);
        process.exit(1);
    }
});

// Запускаем сервер
startServer();

module.exports = { app, server, io };

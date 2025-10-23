# 🔐 Telegram Authorization System

Современная система авторизации через Telegram с поддержкой QR-кодов, SMS кодов и умной логикой для новых и существующих пользователей.

## ✨ Особенности

- 🚀 **QR-код авторизация** для новых пользователей
- 📱 **SMS коды в Telegram** для существующих пользователей  
- 🔄 **Сброс сессии** с автоматической отправкой кода
- 🎨 **Современный UI** с адаптивным дизайном
- ⚡ **Real-time** коммуникация через Socket.IO
- 🔒 **Безопасность** - коды действительны 5 минут
- 🧠 **Умная логика** - автоматическое определение типа пользователя

## 🚀 Быстрый старт

### 1. Клонирование репозитория

```bash
git clone https://github.com/Grangy/auth-telegram-bot.git
cd auth-telegram-bot
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка окружения

Создайте файл `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
PORT=3000
```

### 4. Запуск сервера

```bash
npm start
```

### 5. Открытие в браузере

Перейдите по адресу: http://localhost:3000

## 📋 Как работает система

### Для новых пользователей:
1. **Ввод номера** → получение QR-кода
2. **Сканирование QR-кода** → авторизация через Telegram
3. **Сохранение Telegram ID** для будущих входов

### Для существующих пользователей:
1. **Ввод номера** → автоматическая отправка кода в Telegram
2. **Получение кода** в Telegram
3. **Ввод кода** на сайте → авторизация

### Сброс сессии:
1. **Нажатие "Сброс сессии"** → отправка кода в Telegram
2. **Ввод кода** → новая авторизация

## 🏗️ Структура проекта

```
auth-telegram-bot/
├── public/
│   └── index.html          # Веб-интерфейс
├── server.js               # Основной сервер
├── database.json           # JSON база данных
├── package.json            # Зависимости
├── .env                    # Переменные окружения
├── .gitignore             # Git ignore файл
└── README.md              # Документация
```

## 🔧 API

### Socket.IO события

#### Клиент → Сервер:
- `checkAuth` - Проверка существующей авторизации
- `requestAuth` - Запрос авторизации с номером телефона
- `verifyCode` - Проверка SMS кода
- `resetSession` - Сброс сессии
- `logout` - Выход из системы

#### Сервер → Клиент:
- `authKey` - QR-код и ссылка для авторизации
- `authSuccess` - Успешная авторизация
- `authError` - Ошибка авторизации
- `smsCodeSent` - SMS код отправлен
- `sessionReset` - Сессия сброшена
- `logoutSuccess` - Успешный выход

### Telegram Bot API

- `/start` - Начало работы с ботом
- `/start <key>` - Авторизация по ключу
- Обработка контактов для проверки номеров
- Обработка SMS кодов для авторизации

## 🗄️ База данных

Файл `database.json` содержит:

```json
{
  "sessions": {
    "sessionId": {
      "socketId": "socket_id",
      "phone": "+7XXXXXXXXXX",
      "authorized": true,
      "name": "User Name",
      "telegramUserId": "123456789",
      "timestamp": 1234567890
    }
  },
  "authKeys": {
    "key": {
      "phone": "+7XXXXXXXXXX",
      "socketId": "socket_id",
      "timestamp": 1234567890,
      "used": false,
      "telegramUserId": "123456789"
    }
  },
  "users": {
    "telegramUserId": {
      "phone": "+7XXXXXXXXXX",
      "name": "User Name",
      "telegramUserId": "123456789",
      "lastAuth": 1234567890
    }
  },
  "smsCodes": {
    "phone": {
      "code": "1234",
      "timestamp": 1234567890,
      "used": false,
      "socketId": "socket_id"
    }
  }
}
```

## 🔒 Безопасность

- ✅ **Временные ключи** - действительны 5 минут
- ✅ **Автоматическая очистка** устаревших данных
- ✅ **Проверка номеров** телефонов
- ✅ **Уникальные коды** для каждой авторизации
- ✅ **Socket ID привязка** для безопасности

## 🎨 Интерфейс

### Основные элементы:
- **Форма ввода номера** - для всех пользователей
- **QR-код** - для новых пользователей
- **Форма ввода кода** - для существующих пользователей
- **Кнопка "Сброс сессии"** - для смены авторизации
- **Кнопка "Выйти"** - для завершения сессии

### Дизайн:
- 🎨 Современный градиентный фон
- 📱 Адаптивный дизайн
- ⚡ Плавные анимации
- 🔔 Статусные уведомления

## 🛠️ Разработка

### Запуск в режиме разработки:

```bash
npm run dev
```

### Структура кода:

- **server.js** - основной сервер с Socket.IO и Telegram Bot
- **public/index.html** - веб-интерфейс с JavaScript
- **database.json** - JSON база данных
- **package.json** - зависимости и скрипты

## 📦 Зависимости

- **express** - веб-сервер
- **socket.io** - real-time коммуникация
- **node-telegram-bot-api** - Telegram Bot API
- **qrcode** - генерация QR-кодов
- **uuid** - генерация уникальных ID
- **dotenv** - переменные окружения

## 🚀 Деплой

### Heroku:
```bash
git push heroku main
```

### VPS:
```bash
pm2 start server.js --name telegram-auth
```

### Docker:
```dockerfile
FROM node:16
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit изменения (`git commit -m 'Add some AmazingFeature'`)
4. Push в branch (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. См. файл `LICENSE` для подробностей.

## 📞 Поддержка

Если у вас есть вопросы или предложения, создайте issue в репозитории.

## 🎯 Roadmap

- [ ] Интеграция с SMS сервисами
- [ ] Поддержка множественных ботов
- [ ] Админ панель
- [ ] Статистика авторизаций
- [ ] Webhook поддержка
- [ ] Docker контейнеризация

---

**Сделано с ❤️ для безопасной авторизации через Telegram**

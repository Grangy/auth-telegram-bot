# 🔐 Telegram Authorization Bot

Современная система авторизации через Telegram с продвинутой маской ввода телефона, QR-кодами, WebSocket соединениями и кэшированием.

## 🚀 Возможности

### 📱 **Авторизация через Telegram**
- **SMS-коды** - отправка кодов через Telegram бота
- **QR-коды** - быстрая авторизация через сканирование
- **Ссылки авторизации** - прямые ссылки для мобильных устройств
- **Сессии** - долгосрочное хранение авторизации

### 🎯 **Продвинутая маска телефона**
- **Живое форматирование** с плейсхолдерами `+7 (___) ___-__-__`
- **Автоматическая нормализация** номеров (8→+7, 9→+79, 7→+7)
- **Кнопка очистки** поля
- **Блокировка нечисловых символов**
- **Умная обработка вставки** текста
- **Правильное позиционирование каретки**

### 🌐 **Web-интерфейс**
- **PWA поддержка** - работает как приложение
- **Адаптивный дизайн** - оптимизирован для мобильных
- **Темная тема** с градиентами
- **Анимации** и переходы
- **Service Worker** для офлайн работы

### ⚡ **Производительность**
- **Redis кэширование** - быстрый доступ к данным
- **In-memory кэш** - мгновенные операции
- **WebSocket** - реальное время
- **Prisma ORM** - оптимизированные запросы к БД

## 🏗️ Архитектура

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (PWA)         │◄──►│   (Node.js)     │◄──►│   (PostgreSQL)  │
│                 │    │                 │    │                 │
│ • HTML/CSS/JS   │    │ • Express       │    │ • Prisma ORM    │
│ • Tailwind CSS  │    │ • Socket.IO     │    │ • Sessions      │
│ • Service Worker│    │ • Telegram API  │    │ • Users         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Cache Layer  │
                       │                 │
                       │ • Redis         │
                       │ • In-memory     │
                       │ • TTL support   │
                       └─────────────────┘
```

## 📦 Установка и настройка

### 1. **Клонирование репозитория**
```bash
git clone https://github.com/Grangy/auth-telegram-bot.git
cd auth-telegram-bot
```

### 2. **Установка зависимостей**
```bash
npm install
```

### 3. **Настройка переменных окружения**
Создайте файл `.env` на основе `.env.example`:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
BOT_USERNAME=your_bot_username

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/telegram_auth

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Server Configuration
PORT=3000
LOG_LEVEL=info
```

### 4. **Настройка базы данных**
```bash
# Инициализация базы данных
npm run init-db

# Применение миграций
npm run migrate
```

### 5. **Запуск сервера**
```bash
# Разработка
npm run dev

# Продакшн
npm start
```

## 🛠️ Структура проекта

```
autorisation/
├── 📁 public/                 # Статические файлы
│   ├── index.html            # Главная страница с маской телефона
│   ├── css/                  # Стили
│   ├── js/                   # JavaScript файлы
│   ├── images/               # Изображения
│   ├── manifest.json         # PWA манифест
│   └── sw.js                 # Service Worker
├── 📁 src/                   # Исходный код
│   ├── 📁 config/            # Конфигурация
│   │   └── config.js        # Основные настройки
│   ├── 📁 controllers/        # Контроллеры
│   ├── 📁 middleware/        # Middleware
│   │   └── errorHandler.js  # Обработка ошибок
│   ├── 📁 services/          # Сервисы
│   │   ├── CacheService.js  # Кэширование
│   │   ├── DatabaseService.js # База данных
│   │   ├── PrismaService.js # Prisma ORM
│   │   └── TelegramService.js # Telegram API
│   ├── 📁 scripts/           # Скрипты
│   │   ├── init-db.js        # Инициализация БД
│   │   └── migrate.js        # Миграции
│   └── 📁 utils/             # Утилиты
│       ├── logger.js         # Логирование
│       ├── startupChecklist.js # Проверки запуска
│       └── systemChecks.js   # Системные проверки
├── 📁 scripts/               # Дополнительные скрипты
│   ├── health-check.js      # Проверка здоровья
│   ├── restart-server.js     # Перезапуск сервера
│   └── test-sms-codes.js     # Тестирование SMS
├── 📁 logs/                  # Логи
│   ├── combined.log          # Общий лог
│   ├── error.log             # Ошибки
│   └── 📁 backups/           # Резервные копии БД
├── 📁 prisma/                # Prisma схема
│   └── schema.prisma         # Схема базы данных
├── server.js                 # Главный сервер
├── package.json              # Зависимости
└── README.md                 # Документация
```

## 🔧 API Endpoints

### **WebSocket Events**

#### **Клиент → Сервер**
```javascript
// Запрос авторизации
socket.emit('requestAuth', { phone: '+79991234567' });

// Проверка кода
socket.emit('verifyCode', { phone: '+79991234567', code: '1234' });

// Проверка существующей авторизации
socket.emit('checkAuth', { sessionToken: 'token' });

// Выход из системы
socket.emit('logout');

// Сброс сессии
socket.emit('resetSession');
```

#### **Сервер → Клиент**
```javascript
// Ключ авторизации создан
socket.on('authKey', (data) => {
  // data.qrCode - QR код (base64)
  // data.link - ссылка авторизации
});

// SMS код отправлен
socket.on('smsCodeSent', (data) => {
  // data.phone - номер телефона
});

// Авторизация успешна
socket.on('authSuccess', (data) => {
  // data.name - имя пользователя
  // data.phone - номер телефона
  // data.sessionToken - токен сессии
});

// Ошибка авторизации
socket.on('authError', (data) => {
  // data.message - сообщение об ошибке
});
```

## 🎨 Frontend Features

### **Продвинутая маска телефона**
```javascript
class PhoneMaskHandler {
  // Форматирование с плейсхолдерами
  formatAsRuPhone(rawDigits) {
    // +7 (___) ___-__-__
  }
  
  // Чистое форматирование
  formatAsRuPhoneTight(rawDigits) {
    // +7 (999) 123-45-67
  }
  
  // Нормализация номера
  normalizePhone(phone) {
    // 8 -> +7, 9 -> +79, 7 -> +7
  }
}
```

### **Поддерживаемые форматы ввода**
- `+7 (999) 123-45-67` - стандартный формат
- `8 999 123 45 67` - российский формат с 8
- `79991234567` - цифровой формат
- `9991234567` - без кода страны

### **PWA возможности**
## 🧩 Модульная интеграция (MVP)

### 1) Быстрый старт как виджет

Добавили встраиваемый виджет `TelegramAuthWidget` с колбеками. Достаточно подключить два скрипта и инициализировать:

```html
<script src="/socket.io/socket.io.js"></script>
<script src="/js/phoneMask.js"></script>
<script src="/js/telegramAuthWidget.js"></script>
<div id="auth-widget"></div>
<script>
  const widget = new TelegramAuthWidget({
    target: '#auth-widget',
    onStatus: (msg, type) => console.log('[status]', type, msg),
    onAuthKey: (data) => console.log('[authKey]', data),
    onSmsSent: (data) => console.log('[sms]', data),
    onAuthSuccess: (data) => console.log('[success]', data),
    onAuthError: (data) => console.log('[error]', data)
  });
  // Пример страницы: public/embed.html
  // В меняемых проектах просто меняйте target и колбеки
  // Можно передать существующий socket через options.socket
  // Можно менять подписи кнопок через requestAuthLabel/verifyCodeLabel
  // Вся логика маски вынесена в /js/phoneMask.js (UMD)
  // Виджет экспортируется как UMD модуль
  // Подходит для встраивания в CMS/Next.js/любой SSR
  // В Next.js используйте dynamic import({ ssr: false })
  // и поместите файлы в public или подключайте через CDN собственного приложения
  // Пример адаптера под React/Next.js приведен ниже
  
</script>
```

### 2) Колбеки (успешные и ошибочные сценарии)

- **onAuthKey({ qrCode, link })**: пришла ссылка или QR для авторизации
- **onSmsSent({ phone })**: код отправлен, можно показать поле ввода
- **onAuthSuccess({ name, phone, sessionToken })**: успешный вход
- **onAuthError({ message })**: ошибка авторизации
- **onStatus(message, type)**: статус UI ('info'|'success'|'error')

### 3) Использование в Next.js (пример)

```tsx
// components/TelegramAuth.tsx
import { useEffect, useRef } from 'react';

export default function TelegramAuth() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script1 = document.createElement('script');
    script1.src = '/socket.io/socket.io.js';
    const script2 = document.createElement('script');
    script2.src = '/js/phoneMask.js';
    const script3 = document.createElement('script');
    script3.src = '/js/telegramAuthWidget.js';
    document.body.append(script1, script2, script3);
    script3.onload = () => {
      // @ts-ignore
      const widget = new window.TelegramAuthWidget({
        target: ref.current!,
        onAuthSuccess: (d: any) => console.log('success', d),
        onAuthError: (e: any) => console.error('error', e),
        onStatus: (m: string) => console.log(m)
      });
    };
    return () => { script1.remove(); script2.remove(); script3.remove(); };
  }, []);

  return <div ref={ref} />;
}
```

### 4) Архитектура как модуля (MVP)

- Вся логика маски вынесена в `public/js/phoneMask.js` (UMD) — можно использовать отдельно
- Виджет UI в `public/js/telegramAuthWidget.js` (UMD) — подключите и создайте экземпляр
- Серверные события Socket.IO остаются теми же (`requestAuth`, `verifyCode`, ...)
- Для разных проектов переиспользуются файлы из `public/js`, UI-контейнер и колбеки меняются точечно

### 5) Очистка и минимизация

- Вся телефонная логика — в `phoneMask.js`, удаляйте дубли в `index.html`, если встраиваете виджет
- `embed.html` — пример встраивания; можно использовать как шаблон
- Для продакшна можно собрать `phoneMask.js` и `telegramAuthWidget.js` через Rollup/Webpack в UMD бандл
- При желании вынесите виджет в npm-пакет с именем `@org/telegram-auth-widget`

- **Service Worker** - кэширование ресурсов
- **Manifest** - метаданные приложения
- **Офлайн работа** - базовая функциональность без интернета
- **Установка** - добавление на домашний экран

## 🗄️ База данных

### **Схема Prisma**
```prisma
model User {
  id        String   @id @default(cuid())
  phone     String   @unique
  name      String?
  username  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  sessions Session[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  socketId  String   @unique
  token     String   @unique
  createdAt DateTime @default(now())
  expiresAt DateTime
  
  user User @relation(fields: [userId], references: [id])
}
```

## ⚡ Кэширование

### **Redis Cache**
```javascript
// TTL настройки
ttl: {
  user: 3600,        // 1 час
  session: 3600,     // 1 час
  authKey: 300,      // 5 минут
  smsCode: 300,      // 5 минут
  longTerm: 86400    // 24 часа
}
```

### **In-Memory Cache**
- **Быстрый доступ** к часто используемым данным
- **Автоматическая очистка** по TTL
- **Fallback** при недоступности Redis

## 🔒 Безопасность

### **Валидация данных**
- **Нормализация телефонов** - приведение к единому формату
- **Проверка кодов операторов** - валидные российские номера
- **Ограничение попыток** - защита от брутфорса
- **TTL токенов** - автоматическое истечение сессий

### **Telegram API**
- **Официальный API** - безопасное взаимодействие
- **Webhook поддержка** - получение обновлений
- **Обработка ошибок** - graceful degradation

## 📊 Мониторинг и логирование

### **Структурированные логи**
```json
{
  "level": "info",
  "message": "🚀 Сервер запущен на порту 3000",
  "service": "telegram-auth",
  "timestamp": "2025-10-24T11:07:42.470Z"
}
```

### **Уровни логирования**
- `error` - критические ошибки
- `warn` - предупреждения
- `info` - информационные сообщения
- `debug` - отладочная информация

### **Ротация логов**
- **Максимум 5 файлов** по 10MB каждый
- **Автоматическая очистка** старых логов
- **Резервные копии** базы данных

## 🚀 Деплой

### **Render.com**
```bash
# Автоматический деплой из GitHub
# Настройки в RENDER_DEPLOYMENT.md
```

### **Docker (опционально)**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🧪 Тестирование

### **Скрипты тестирования**
```bash
# Проверка здоровья системы
node scripts/health-check.js

# Тестирование SMS кодов
node scripts/test-sms-codes.js

# Перезапуск сервера
node scripts/restart-server.js
```

### **Ручное тестирование**
1. Откройте `http://localhost:3000`
2. Введите номер телефона в любом формате
3. Проверьте автоматическое форматирование
4. Протестируйте кнопку очистки
5. Проверьте валидацию на blur

## 🔧 Разработка

### **Команды разработки**
```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Инициализация базы данных
npm run init-db

# Применение миграций
npm run migrate

# Проверка здоровья
npm run health-check
```

### **Структура кода**
- **Модульная архитектура** - разделение ответственности
- **Сервисный слой** - бизнес-логика
- **Middleware** - обработка запросов
- **Утилиты** - вспомогательные функции

## 📱 Мобильная оптимизация

### **Адаптивный дизайн**
- **Tailwind CSS** - utility-first подход
- **Flexbox/Grid** - современная верстка
- **Touch-friendly** - оптимизация для касаний

### **PWA функции**
- **Service Worker** - кэширование и офлайн работа
- **Manifest** - метаданные приложения
- **Responsive images** - оптимизация изображений

## 🤝 Вклад в проект

### **Workflow**
1. Fork репозитория
2. Создайте feature branch
3. Внесите изменения
4. Добавьте тесты
5. Создайте Pull Request

### **Стандарты кода**
- **ESLint** - проверка стиля кода
- **Prettier** - форматирование
- **Conventional Commits** - стандартные сообщения коммитов

## 📄 Лицензия

MIT License - см. файл [LICENSE](LICENSE) для деталей.

## 🆘 Поддержка

### **Проблемы и вопросы**
- Создайте [Issue](https://github.com/Grangy/auth-telegram-bot/issues)
- Опишите проблему подробно
- Приложите логи и скриншоты

### **Документация**
- [API Reference](docs/api.md)
- [Deployment Guide](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md)

---

**Создано с ❤️ для безопасной авторизации через Telegram**
# 🚀 Деплой на Render

## 📋 Подготовка к деплою

### 1. Redis на Render

#### Вариант A: Redis Cloud (Рекомендуется)
1. Зарегистрируйтесь на [Redis Cloud](https://redis.com/redis-enterprise-cloud/overview/)
2. Создайте бесплатную базу данных (30MB)
3. Получите connection string
4. Добавьте в переменные окружения Render:
   ```
   REDIS_URL=redis://username:password@host:port
   ```

#### Вариант B: Render Redis Service
1. В панели Render создайте новый Redis сервис
2. Получите connection details
3. Добавьте переменные окружения:
   ```
   REDIS_HOST=your-redis-host
   REDIS_PORT=6379
   REDIS_PASSWORD=your-password
   ```

### 2. Переменные окружения для Render

```bash
# Server
PORT=3000

# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token
BOT_USERNAME=your_bot_username

# Database (MongoDB Atlas)
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/db

# Redis (выберите один вариант)
# Вариант A: Redis Cloud
REDIS_URL=redis://username:password@host:port

# Вариант B: Render Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# Logging
LOG_LEVEL=info
```

## 🔧 Настройка деплоя

### 1. Build Command
```bash
npm install
```

### 2. Start Command
```bash
npm start
```

### 3. Health Check
```bash
GET /health
```

## 🛡️ Отказоустойчивость

Система автоматически переключается на in-memory кэш при недоступности Redis:

- ✅ Fallback кэш работает без Redis
- ✅ Автоматическое восстановление соединения
- ✅ Graceful degradation
- ✅ Мониторинг статуса подключения

## 📊 Мониторинг

### Health Check Endpoint
```bash
GET /health
```

Возвращает:
```json
{
  "database": true,
  "redis": true,
  "telegram": true,
  "uptime": 123.45
}
```

### Логи
- Все логи сохраняются в файлы
- Структурированное логирование
- Мониторинг ошибок Redis

## 🚀 Команды для деплоя

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/Grangy/auth-telegram-bot.git

# 2. Подключите к Render
# Следуйте инструкциям в панели Render

# 3. Настройте переменные окружения
# Добавьте все переменные из .env

# 4. Деплой
# Render автоматически задеплоит при push в main
```

## 🔍 Troubleshooting

### Redis Connection Issues
- Проверьте переменные окружения
- Убедитесь, что Redis сервис запущен
- Проверьте логи на наличие ошибок подключения

### Database Issues
- Проверьте DATABASE_URL
- Убедитесь, что MongoDB Atlas доступен
- Проверьте IP whitelist

### Telegram Bot Issues
- Проверьте TELEGRAM_BOT_TOKEN
- Убедитесь, что бот активен
- Проверьте webhook настройки

## 📈 Масштабирование

### Redis Cloud Plans
- **Free**: 30MB, 30 connections
- **Fixed**: $7/month, 250MB
- **Flexible**: от $7/month, 1GB+

### Render Plans
- **Free**: 750 hours/month
- **Starter**: $7/month, always-on
- **Standard**: $25/month, auto-scaling

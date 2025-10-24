# Настройка MongoDB Atlas + Prisma + Redis

## 1. Настройка MongoDB Atlas

1. Зайдите на [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Создайте новый кластер
3. Создайте пользователя базы данных
4. Получите строку подключения

## 2. Настройка Redis

### Локальный Redis
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis-server
```

### Redis Cloud (рекомендуется для продакшена)
1. Зайдите на [Redis Cloud](https://redis.com/redis-enterprise-cloud/overview/)
2. Создайте бесплатный аккаунт
3. Создайте базу данных
4. Получите данные подключения

## 3. Настройка переменных окружения

Скопируйте `env.example` в `.env` и заполните:

```bash
cp env.example .env
```

Заполните переменные в `.env`:

```env
# Server Configuration
PORT=3000

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_actual_bot_token
BOT_USERNAME=your_bot_username

# Database Configuration (MongoDB Atlas)
DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/telegram-auth?retryWrites=true&w=majority"

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_if_any

# Logging Configuration
LOG_LEVEL=info
```

## 4. Установка зависимостей

```bash
npm install
```

## 5. Генерация Prisma клиента

```bash
npm run db:generate
```

## 6. Синхронизация схемы с базой данных

```bash
npm run db:push
```

## 7. Миграция данных (если есть старая база)

```bash
npm run db:seed
```

## 8. Запуск сервера

### С новой архитектурой (Prisma + Redis)
```bash
npm run start:prisma
```

### В режиме разработки
```bash
npm run dev:prisma
```

## 9. Полезные команды

```bash
# Генерация Prisma клиента
npm run db:generate

# Синхронизация схемы
npm run db:push

# Миграция данных
npm run db:migrate

# Просмотр базы данных
npm run db:studio

# Миграция старых данных
npm run db:seed
```

## Архитектура

### Новые компоненты:

1. **PrismaService** - работа с MongoDB через Prisma ORM
2. **CacheService** - кэширование в Redis
3. **Модульная структура** - разделение на сервисы
4. **Автоматическое кэширование** - часто используемые данные кэшируются
5. **Очистка устаревших данных** - автоматическая очистка по расписанию

### Преимущества новой архитектуры:

- ✅ **Масштабируемость** - MongoDB Atlas + Redis
- ✅ **Производительность** - кэширование часто используемых данных
- ✅ **Надежность** - автоматическая очистка устаревших данных
- ✅ **Мониторинг** - детальное логирование всех операций
- ✅ **Типобезопасность** - Prisma обеспечивает типизацию
- ✅ **Автоматические резервные копии** - MongoDB Atlas

## Мониторинг

### Логи
- `logs/combined.log` - все логи
- `logs/error.log` - только ошибки

### Кэш
- Redis предоставляет статистику использования памяти
- Автоматическая очистка устаревших ключей

### База данных
- Prisma Studio для просмотра данных: `npm run db:studio`
- MongoDB Atlas Dashboard для мониторинга

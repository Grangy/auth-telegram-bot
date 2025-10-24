# 🗄️ Настройка MongoDB Atlas

## 1. Создание кластера MongoDB Atlas

### Шаг 1: Регистрация
1. Перейдите на [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Нажмите "Try Free" или "Start Free"
3. Зарегистрируйтесь или войдите в аккаунт

### Шаг 2: Создание кластера
1. Выберите **M0 Sandbox** (бесплатный)
2. Выберите провайдера (AWS, Google Cloud, Azure)
3. Выберите регион (ближайший к вам)
4. Нажмите "Create Cluster"

### Шаг 3: Настройка доступа
1. **Database User**:
   - Username: `telegram-auth-user`
   - Password: сгенерируйте надежный пароль
   - Database User Privileges: "Read and write to any database"

2. **Network Access**:
   - IP Access List: "Allow access from anywhere" (0.0.0.0/0)
   - Или добавьте ваш IP адрес

## 2. Получение строки подключения

### Шаг 1: Подключение к кластеру
1. В дашборде Atlas нажмите "Connect"
2. Выберите "Connect your application"
3. Driver: "Node.js"
4. Version: "4.1 or later"

### Шаг 2: Копирование строки
Скопируйте строку подключения, она выглядит так:
```
mongodb+srv://telegram-auth-user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

### Шаг 3: Обновление строки
Замените `<password>` на ваш пароль и добавьте имя базы данных:
```
mongodb+srv://telegram-auth-user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/telegram-auth?retryWrites=true&w=majority
```

## 3. Настройка проекта

### Шаг 1: Создание .env файла
Создайте файл `.env` в корне проекта:

```env
# Server Configuration
PORT=3000

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
BOT_USERNAME=your_bot_username

# Database Configuration (MongoDB Atlas)
DATABASE_URL="mongodb+srv://telegram-auth-user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/telegram-auth?retryWrites=true&w=majority"

# Redis Configuration (опционально)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Logging Configuration
LOG_LEVEL=info
```

### Шаг 2: Синхронизация схемы
```bash
# Генерация Prisma клиента
npm run db:generate

# Синхронизация схемы с базой данных
npm run db:push
```

### Шаг 3: Запуск сервера
```bash
npm start
```

## 4. Проверка работы

### Шаг 1: Просмотр базы данных
```bash
npm run db:studio
```
Откроется Prisma Studio для просмотра данных.

### Шаг 2: Проверка логов
```bash
tail -f logs/combined.log
```

### Шаг 3: Тестирование
1. Откройте http://localhost:3000
2. Введите любой номер телефона
3. Проверьте работу авторизации

## 5. Структура базы данных

После синхронизации в MongoDB будут созданы коллекции:

- **users** - пользователи
- **sessions** - сессии
- **authkeys** - ключи авторизации
- **longtermsessions** - долгосрочные сессии
- **smscodes** - SMS коды
- **cacheentries** - кэш записи

## 6. Мониторинг

### MongoDB Atlas Dashboard
- Перейдите в дашборд Atlas
- Откройте ваш кластер
- Просматривайте метрики и логи

### Prisma Studio
```bash
npm run db:studio
```

### Логи приложения
```bash
# Все логи
tail -f logs/combined.log

# Только ошибки
tail -f logs/error.log
```

## 7. Резервные копии

MongoDB Atlas автоматически создает резервные копии:
- **M0 Sandbox**: ежедневные снимки
- **M2+**: непрерывные резервные копии

## 8. Безопасность

### Рекомендации:
1. **Используйте сильные пароли** для пользователей БД
2. **Ограничьте IP адреса** в Network Access
3. **Регулярно обновляйте** пароли
4. **Мониторьте** доступ к базе данных

### Настройка IP Whitelist:
1. В Atlas перейдите в "Network Access"
2. Добавьте IP адреса ваших серверов
3. Или используйте "Allow access from anywhere" для разработки

## 9. Troubleshooting

### Ошибка подключения:
```
Error: connect ECONNREFUSED
```
**Решение**: Проверьте строку подключения и настройки сети

### Ошибка аутентификации:
```
Error: Authentication failed
```
**Решение**: Проверьте username и password в строке подключения

### Ошибка доступа:
```
Error: not authorized
```
**Решение**: Проверьте права пользователя в Atlas

## 10. Полезные команды

```bash
# Генерация Prisma клиента
npm run db:generate

# Синхронизация схемы
npm run db:push

# Просмотр базы данных
npm run db:studio

# Запуск сервера
npm start

# Разработка с автоперезагрузкой
npm run dev
```

## 🎯 Готово!

После настройки MongoDB Atlas ваш проект будет работать с:
- ✅ **Масштабируемой базой данных**
- ✅ **Автоматическими резервными копиями**
- ✅ **Мониторингом и логированием**
- ✅ **Высокой производительностью**

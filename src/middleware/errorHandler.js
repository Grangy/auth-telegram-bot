const logger = require('../utils/logger');

class ErrorHandler {
    constructor() {
        this.errorCounts = new Map();
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 секунда
    }

    // Обработка ошибок базы данных
    async handleDatabaseError(error, operation, context = {}) {
        const errorKey = `${operation}_${error.code || 'unknown'}`;
        const count = this.errorCounts.get(errorKey) || 0;
        
        logger.error(`Ошибка БД в операции ${operation}:`, {
            error: error.message,
            code: error.code,
            operation,
            context,
            retryCount: count
        });

        // Если это ошибка подключения, пытаемся переподключиться
        if (error.code === 'P1001' || error.message.includes('connection')) {
            return this.handleConnectionError(error, operation, context);
        }

        // Если это ошибка валидации, не повторяем
        if (error.code === 'P2002' || error.code === 'P2010') {
            return this.handleValidationError(error, operation, context);
        }

        // Для других ошибок - повторяем с задержкой
        if (count < this.maxRetries) {
            this.errorCounts.set(errorKey, count + 1);
            await this.delay(this.retryDelay * (count + 1));
            return { shouldRetry: true, error };
        }

        return { shouldRetry: false, error };
    }

    // Обработка ошибок подключения
    async handleConnectionError(error, operation, context) {
        logger.warn(`Проблема с подключением к БД в операции ${operation}`, {
            error: error.message,
            operation,
            context
        });

        // Здесь можно добавить логику переподключения к БД
        return { shouldRetry: false, error, needsReconnect: true };
    }

    // Обработка ошибок валидации
    handleValidationError(error, operation, context) {
        logger.error(`Ошибка валидации в операции ${operation}:`, {
            error: error.message,
            code: error.code,
            operation,
            context
        });

        return { shouldRetry: false, error, isValidationError: true };
    }

    // Обработка ошибок Redis
    async handleRedisError(error, operation, context = {}) {
        logger.warn(`Ошибка Redis в операции ${operation}:`, {
            error: error.message,
            operation,
            context
        });

        // Redis не критичен, продолжаем работу
        return { shouldRetry: false, error, isNonCritical: true };
    }

    // Обработка ошибок Telegram
    handleTelegramError(error, operation, context = {}) {
        logger.error(`Ошибка Telegram в операции ${operation}:`, {
            error: error.message,
            operation,
            context
        });

        return { shouldRetry: false, error, isTelegramError: true };
    }

    // Обработка общих ошибок
    handleGeneralError(error, operation, context = {}) {
        logger.error(`Общая ошибка в операции ${operation}:`, {
            error: error.message,
            stack: error.stack,
            operation,
            context
        });

        return { shouldRetry: false, error };
    }

    // Универсальный обработчик ошибок
    async handleError(error, operation, context = {}) {
        try {
            // Определяем тип ошибки
            if (error.name === 'PrismaClientKnownRequestError' || 
                error.name === 'PrismaClientValidationError') {
                return await this.handleDatabaseError(error, operation, context);
            }
            
            if (error.message.includes('Redis') || error.message.includes('ECONNREFUSED')) {
                return await this.handleRedisError(error, operation, context);
            }
            
            if (error.message.includes('Telegram') || error.message.includes('bot')) {
                return this.handleTelegramError(error, operation, context);
            }

            return this.handleGeneralError(error, operation, context);
        } catch (handlerError) {
            logger.error('Ошибка в обработчике ошибок:', handlerError);
            return { shouldRetry: false, error: handlerError };
        }
    }

    // Сброс счетчиков ошибок
    resetErrorCounts() {
        this.errorCounts.clear();
        logger.info('Счетчики ошибок сброшены');
    }

    // Получение статистики ошибок
    getErrorStats() {
        const stats = {};
        for (const [key, count] of this.errorCounts) {
            stats[key] = count;
        }
        return stats;
    }

    // Задержка
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Обработка критических ошибок
    handleCriticalError(error, operation, context = {}) {
        logger.error(`💥 КРИТИЧЕСКАЯ ОШИБКА в операции ${operation}:`, {
            error: error.message,
            stack: error.stack,
            operation,
            context,
            timestamp: new Date().toISOString()
        });

        // Здесь можно добавить уведомления администратора
        // Например, отправка в Slack, email, etc.
        
        return { shouldRetry: false, error, isCritical: true };
    }
}

module.exports = new ErrorHandler();

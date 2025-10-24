const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const config = require('../config/config');

class TelegramService {
    constructor() {
        this.bot = null;
        this.errorCount = 0;
        this.maxErrors = 3;
        this.init();
    }

    init() {
        try {
            this.bot = new TelegramBot(config.botToken, { 
                polling: {
                    interval: 1000,
                    autoStart: false
                }
            });
            
            this.setupErrorHandling();
            this.setupEventHandlers();
            
            // Запуск с задержкой
            setTimeout(() => {
                this.startPolling();
            }, 2000);
            
        } catch (error) {
            logger.error('Критическая ошибка инициализации бота:', error);
            throw error;
        }
    }

    setupErrorHandling() {
        this.bot.on('error', (error) => {
            this.errorCount++;
            logger.error(`Ошибка Telegram бота (${this.errorCount}/${this.maxErrors}):`, error.message);
            
            if (error.message.includes('Conflict: terminated by other getUpdates request')) {
                this.handleConflictError();
            } else if (error.message.includes('ETELEGRAM') || error.message.includes('ECONNRESET')) {
                // Сетевые ошибки - перезапускаем polling
                this.handleNetworkError();
            }
            
            if (this.errorCount >= this.maxErrors) {
                logger.error('Превышено максимальное количество ошибок. Бот отключен.');
                return;
            }
        });
        
        this.bot.on('polling_error', (error) => {
            logger.error('Ошибка polling:', error.message);
            this.handlePollingError(error);
        });
    }

    handleConflictError() {
        logger.info('Обнаружен конфликт getUpdates. Останавливаем polling...');
        try {
            this.bot.stopPolling();
            logger.info('Polling остановлен. Перезапуск через 10 секунд...');
            setTimeout(() => {
                try {
                    this.bot.startPolling();
                    logger.info('Polling перезапущен');
                    this.errorCount = 0;
                } catch (restartError) {
                    logger.error('Ошибка перезапуска polling:', restartError.message);
                }
            }, 10000);
        } catch (stopError) {
            logger.error('Ошибка остановки polling:', stopError.message);
        }
    }

    handleNetworkError() {
        logger.info('Обнаружена сетевая ошибка. Перезапуск polling через 5 секунд...');
        try {
            this.bot.stopPolling();
            setTimeout(() => {
                try {
                    this.bot.startPolling();
                    logger.info('Polling перезапущен после сетевой ошибки');
                    this.errorCount = 0;
                } catch (restartError) {
                    logger.error('Ошибка перезапуска polling после сетевой ошибки:', restartError.message);
                }
            }, 5000);
        } catch (stopError) {
            logger.error('Ошибка остановки polling при сетевой ошибке:', stopError.message);
        }
    }

    handlePollingError(error) {
        logger.error('Обработка ошибки polling:', error.message);
        
        // Если это временная ошибка, пытаемся перезапустить
        if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
            logger.info('Временная ошибка polling. Перезапуск через 3 секунды...');
            setTimeout(() => {
                try {
                    this.bot.startPolling();
                    logger.info('Polling перезапущен после временной ошибки');
                } catch (restartError) {
                    logger.error('Ошибка перезапуска polling после временной ошибки:', restartError.message);
                }
            }, 3000);
        }
    }

    setupEventHandlers() {
        // Обработчики событий Telegram бота настроены в server.js
        // Этот метод оставлен для совместимости, но обработчики не регистрируются здесь
        logger.info('Обработчики событий Telegram бота настроены в server.js');
    }

    startPolling() {
        try {
            this.bot.startPolling();
            logger.info('Telegram бот запущен');
        } catch (error) {
            logger.error('Ошибка запуска бота:', error.message);
        }
    }

    stopPolling() {
        try {
            this.bot.stopPolling();
            logger.info('Polling остановлен');
        } catch (error) {
            logger.error('Ошибка остановки polling:', error.message);
        }
    }

    sendMessage(chatId, message) {
        return this.bot.sendMessage(chatId, message).catch(error => {
            logger.error('Ошибка отправки сообщения в Telegram:', error.message);
            throw error;
        });
    }

    getBot() {
        return this.bot;
    }
}

module.exports = TelegramService;

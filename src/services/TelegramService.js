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
            }
            
            if (this.errorCount >= this.maxErrors) {
                logger.error('Превышено максимальное количество ошибок. Бот отключен.');
                return;
            }
        });
        
        this.bot.on('polling_error', (error) => {
            logger.error('Ошибка polling:', error.message);
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

    setupEventHandlers() {
        // Обработчики событий бота будут добавлены здесь
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

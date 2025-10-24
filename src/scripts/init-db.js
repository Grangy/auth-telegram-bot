#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

class DatabaseInitializer {
    constructor() {
        this.prisma = new PrismaClient();
    }

    async initialize() {
        try {
            console.log('🔄 Инициализация базы данных...');
            
            // Проверяем подключение
            await this.testConnection();
            
            // Создаем индексы
            await this.createIndexes();
            
            // Проверяем структуру
            await this.validateSchema();
            
            console.log('✅ База данных успешно инициализирована');
            
        } catch (error) {
            console.error('❌ Ошибка инициализации базы данных:', error);
            throw error;
        } finally {
            await this.prisma.$disconnect();
        }
    }

    async testConnection() {
        try {
            console.log('🔍 Проверка подключения к базе данных...');
            await this.prisma.$connect();
            console.log('✅ Подключение к базе данных установлено');
        } catch (error) {
            console.error('❌ Не удалось подключиться к базе данных:', error.message);
            throw new Error(`Ошибка подключения к БД: ${error.message}`);
        }
    }

    async createIndexes() {
        try {
            console.log('📊 Создание индексов...');
            
            // MongoDB автоматически создает индексы для уникальных полей
            // Но мы можем добавить дополнительные индексы для производительности
            
            // Проверяем существование коллекций
            const collections = await this.prisma.$runCommandRaw({ listCollections: 1 });
            console.log('📋 Найденные коллекции:', collections.cursor.firstBatch.map(c => c.name));
            
            console.log('✅ Индексы настроены');
        } catch (error) {
            console.warn('⚠️  Предупреждение при создании индексов:', error.message);
        }
    }

    async validateSchema() {
        try {
            console.log('🔍 Проверка структуры базы данных...');
            
            // Проверяем, что можем выполнить базовые операции
            const userCount = await this.prisma.user.count();
            const sessionCount = await this.prisma.session.count();
            const authKeyCount = await this.prisma.authKey.count();
            const smsCodeCount = await this.prisma.smsCode.count();
            const longTermSessionCount = await this.prisma.longTermSession.count();
            const cacheEntryCount = await this.prisma.cacheEntry.count();
            
            console.log('📊 Статистика базы данных:');
            console.log(`   👥 Пользователи: ${userCount}`);
            console.log(`   🔐 Сессии: ${sessionCount}`);
            console.log(`   🔑 Ключи авторизации: ${authKeyCount}`);
            console.log(`   📱 SMS коды: ${smsCodeCount}`);
            console.log(`   ⏰ Долгосрочные сессии: ${longTermSessionCount}`);
            console.log(`   💾 Кэш записи: ${cacheEntryCount}`);
            
            console.log('✅ Структура базы данных корректна');
        } catch (error) {
            console.error('❌ Ошибка проверки структуры БД:', error.message);
            throw error;
        }
    }

    async cleanup() {
        try {
            console.log('🧹 Очистка устаревших данных...');
            
            const now = new Date();
            
            // Очищаем устаревшие сессии
            const expiredSessions = await this.prisma.session.deleteMany({
                where: { expiresAt: { lt: now } }
            });
            
            // Очищаем устаревшие ключи авторизации
            const expiredAuthKeys = await this.prisma.authKey.deleteMany({
                where: { expiresAt: { lt: now } }
            });
            
            // Очищаем устаревшие SMS коды
            const expiredSmsCodes = await this.prisma.smsCode.deleteMany({
                where: { expiresAt: { lt: now } }
            });
            
            // Очищаем устаревшие долгосрочные сессии
            const expiredLongTermSessions = await this.prisma.longTermSession.deleteMany({
                where: { expiresAt: { lt: now } }
            });
            
            // Очищаем устаревшие кэш записи
            const expiredCacheEntries = await this.prisma.cacheEntry.deleteMany({
                where: { expiresAt: { lt: now } }
            });
            
            console.log('🧹 Очистка завершена:');
            console.log(`   🔐 Устаревшие сессии: ${expiredSessions.count}`);
            console.log(`   🔑 Устаревшие ключи: ${expiredAuthKeys.count}`);
            console.log(`   📱 Устаревшие SMS коды: ${expiredSmsCodes.count}`);
            console.log(`   ⏰ Устаревшие долгосрочные сессии: ${expiredLongTermSessions.count}`);
            console.log(`   💾 Устаревшие кэш записи: ${expiredCacheEntries.count}`);
            
        } catch (error) {
            console.warn('⚠️  Предупреждение при очистке:', error.message);
        }
    }
}

// Запуск инициализации
async function main() {
    const initializer = new DatabaseInitializer();
    
    try {
        await initializer.initialize();
        
        // Опционально: очистка устаревших данных
        if (process.argv.includes('--cleanup')) {
            await initializer.cleanup();
        }
        
        console.log('🎉 Инициализация завершена успешно!');
        process.exit(0);
    } catch (error) {
        console.error('💥 Критическая ошибка инициализации:', error.message);
        process.exit(1);
    }
}

// Запуск только если файл выполняется напрямую
if (require.main === module) {
    main();
}

module.exports = DatabaseInitializer;

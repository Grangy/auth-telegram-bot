#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки работы SMS кодов
 * Использование: node scripts/test-sms-codes.js
 */

const PrismaService = require('../src/services/PrismaService');
const CacheService = require('../src/services/CacheService');
const logger = require('../src/utils/logger');

async function testSmsCodes() {
    console.log('🧪 Тестирование SMS кодов...');
    
    const prismaService = new PrismaService();
    const cacheService = new CacheService();
    
    try {
        // Подключаемся к базе данных
        await prismaService.connect();
        console.log('✅ Подключение к БД установлено');
        
        const testPhone = '+79817750018';
        const testCode = '1234';
        
        // 1. Создаем SMS код
        console.log(`\n1️⃣ Создание SMS кода для ${testPhone}...`);
        const smsData = {
            phone: testPhone,
            code: testCode,
            socketId: 'test-socket',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        };
        
        const createdSms = await prismaService.createSmsCode(smsData);
        console.log('✅ SMS код создан в БД:', createdSms);
        
        // 2. Сохраняем в кэш
        console.log(`\n2️⃣ Сохранение в кэш...`);
        await cacheService.setSmsCode(testPhone, {
            code: testCode,
            socketId: 'test-socket',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        });
        console.log('✅ SMS код сохранен в кэш');
        
        // 3. Проверяем кэш
        console.log(`\n3️⃣ Проверка кэша...`);
        const cachedData = await cacheService.getSmsCode(testPhone);
        console.log('📦 Данные из кэша:', cachedData);
        
        // 4. Проверяем БД
        console.log(`\n4️⃣ Проверка БД...`);
        const dbData = await prismaService.findSmsCode(testPhone);
        console.log('🗄️ Данные из БД:', dbData);
        
        // 5. Сравниваем коды
        console.log(`\n5️⃣ Сравнение кодов...`);
        console.log(`Ожидаемый код: "${testCode}"`);
        console.log(`Код из кэша: "${cachedData?.code}"`);
        console.log(`Код из БД: "${dbData?.code}"`);
        console.log(`Кэш === Ожидаемый: ${cachedData?.code === testCode}`);
        console.log(`БД === Ожидаемый: ${dbData?.code === testCode}`);
        
        // 6. Тестируем разные варианты ввода
        console.log(`\n6️⃣ Тестирование разных вариантов ввода...`);
        const testInputs = ['1234', ' 1234 ', '1234\n', '\t1234\t'];
        
        for (const input of testInputs) {
            console.log(`Ввод: "${input}" -> Сравнение: ${cachedData?.code === input}`);
        }
        
        // 7. Очистка
        console.log(`\n7️⃣ Очистка тестовых данных...`);
        await prismaService.markSmsCodeAsUsed(testPhone);
        await cacheService.invalidateSmsCode(testPhone);
        console.log('✅ Тестовые данные очищены');
        
        console.log('\n🎉 Тестирование завершено!');
        
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error);
    } finally {
        await prismaService.disconnect();
    }
}

// Запуск теста
testSmsCodes();

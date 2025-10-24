const logger = require('./logger');

class StartupChecklist {
    constructor() {
        this.checks = [];
        this.results = [];
    }

    // Добавить проверку
    addCheck(name, checkFunction, required = true) {
        this.checks.push({
            name,
            checkFunction,
            required,
            status: 'pending'
        });
    }

    // Выполнить все проверки
    async runChecks() {
        console.log('\n🔍 Запуск проверки системы...\n');
        
        let allPassed = true;
        let criticalFailed = false;

        for (let i = 0; i < this.checks.length; i++) {
            const check = this.checks[i];
            const checkNumber = i + 1;
            const totalChecks = this.checks.length;
            
            try {
                console.log(`[${checkNumber}/${totalChecks}] 🔍 ${check.name}...`);
                
                const result = await check.checkFunction();
                check.status = 'passed';
                check.result = result;
                
                console.log(`[${checkNumber}/${totalChecks}] ✅ ${check.name} - OK`);
                
                if (result && typeof result === 'object') {
                    if (result.message) console.log(`    💬 ${result.message}`);
                    if (result.details) console.log(`    📊 ${result.details}`);
                }
                
            } catch (error) {
                check.status = 'failed';
                check.error = error;
                
                if (check.required) {
                    criticalFailed = true;
                    console.log(`[${checkNumber}/${totalChecks}] ❌ ${check.name} - КРИТИЧЕСКАЯ ОШИБКА`);
                    console.log(`    💥 ${error.message}`);
                } else {
                    console.log(`[${checkNumber}/${totalChecks}] ⚠️  ${check.name} - ПРЕДУПРЕЖДЕНИЕ`);
                    console.log(`    ⚠️  ${error.message}`);
                }
            }
            
            // Небольшая пауза между проверками
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Выводим итоговый отчет
        this.printSummary();
        
        if (criticalFailed) {
            console.log('\n💥 КРИТИЧЕСКИЕ ОШИБКИ ОБНАРУЖЕНЫ!');
            console.log('🚫 Сервер не может быть запущен.');
            console.log('📝 Проверьте настройки и попробуйте снова.\n');
            return false;
        }

        if (allPassed) {
            console.log('\n🎉 ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!');
            console.log('🚀 Сервер готов к запуску.\n');
        }

        return true;
    }

    // Вывести итоговый отчет
    printSummary() {
        console.log('\n📊 ИТОГОВЫЙ ОТЧЕТ:');
        console.log('═'.repeat(50));
        
        const passed = this.checks.filter(c => c.status === 'passed').length;
        const failed = this.checks.filter(c => c.status === 'failed').length;
        const critical = this.checks.filter(c => c.status === 'failed' && c.required).length;
        
        console.log(`✅ Успешно: ${passed}`);
        console.log(`❌ Ошибки: ${failed}`);
        console.log(`💥 Критические: ${critical}`);
        
        if (failed > 0) {
            console.log('\n🔍 ДЕТАЛИ ОШИБОК:');
            this.checks
                .filter(c => c.status === 'failed')
                .forEach(check => {
                    const status = check.required ? '💥 КРИТИЧЕСКАЯ' : '⚠️  ПРЕДУПРЕЖДЕНИЕ';
                    console.log(`   ${status}: ${check.name}`);
                    console.log(`      ${check.error.message}`);
                });
        }
        
        console.log('═'.repeat(50));
    }

    // Получить результаты проверок
    getResults() {
        return this.checks.map(check => ({
            name: check.name,
            status: check.status,
            required: check.required,
            result: check.result,
            error: check.error
        }));
    }
}

module.exports = StartupChecklist;

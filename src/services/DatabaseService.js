const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class DatabaseService {
    constructor(databasePath) {
        this.databasePath = databasePath;
        this.ensureDatabaseExists();
    }

    ensureDatabaseExists() {
        if (!fs.existsSync(this.databasePath)) {
            const defaultData = {
                sessions: {},
                authKeys: {},
                users: {},
                longTermSessions: {},
                smsCodes: {}
            };
            this.saveDatabase(defaultData);
            logger.info('Создана новая база данных');
        }
    }

    loadDatabase() {
        try {
            const data = fs.readFileSync(this.databasePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('Ошибка загрузки базы данных:', error);
            return {
                sessions: {},
                authKeys: {},
                users: {},
                longTermSessions: {},
                smsCodes: {}
            };
        }
    }

    saveDatabase(db) {
        try {
            // Создаем резервную копию
            this.createBackup();
            
            fs.writeFileSync(this.databasePath, JSON.stringify(db, null, 2));
            logger.debug('База данных сохранена');
        } catch (error) {
            logger.error('Ошибка сохранения базы данных:', error);
            throw error;
        }
    }

    createBackup() {
        try {
            const backupDir = path.dirname(this.databasePath) + '/logs/backups';
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(backupDir, `database-${timestamp}.json`);
            
            if (fs.existsSync(this.databasePath)) {
                fs.copyFileSync(this.databasePath, backupPath);
                logger.debug(`Создана резервная копия: ${backupPath}`);
            }
        } catch (error) {
            logger.error('Ошибка создания резервной копии:', error);
        }
    }

    cleanupOldSessions() {
        const db = this.loadDatabase();
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 часа
        
        let cleaned = false;
        
        // Очистка сессий
        for (const [sessionId, session] of Object.entries(db.sessions || {})) {
            if (now - session.timestamp > maxAge) {
                delete db.sessions[sessionId];
                cleaned = true;
            }
        }
        
        // Очистка кодов
        for (const [phone, codeData] of Object.entries(db.smsCodes || {})) {
            if (now - codeData.timestamp > 5 * 60 * 1000) { // 5 минут
                delete db.smsCodes[phone];
                cleaned = true;
            }
        }
        
        if (cleaned) {
            this.saveDatabase(db);
            logger.info('Очищены устаревшие данные');
        }
    }
}

module.exports = DatabaseService;

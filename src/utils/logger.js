const winston = require('winston');
const config = require('../config/config');

const logger = winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'telegram-auth' },
    transports: [
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxFiles: config.logging.maxFiles,
            maxsize: config.logging.maxSize
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxFiles: config.logging.maxFiles,
            maxsize: config.logging.maxSize
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

module.exports = logger;

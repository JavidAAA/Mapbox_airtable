const winston = require('winston');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
const { combine, timestamp, printf, colorize, align, errors, json } = winston.format;
const logDirectory = path.join(__dirname, '../logs');

// GroupMe transports
class GroupMeTransport extends winston.Transport {
  constructor(opts) {
    super(opts);
    this.name = 'groupMeTransport';
  }

  log(info, callback) {
    if (info.level === 'error' || info.level === 'warn') {
      const message = `[${info.timestamp}] ${info.level.toUpperCase()}: (MAPS) ${info.message}`;

      // Send the message to GroupMe bot
      axios.post('https://api.groupme.com/v3/bots/post', {
        bot_id: process.env.GROUPME_BOT,
        text: message
      })
      .then(() => {
        console.log('Sent error message to GroupMe');
      })
      .catch(err => {
        console.error('Failed to send message to GroupMe:', err);
      });
    }

    callback();
  }
}

if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

const estTimestamp = timestamp({
  format: () => {
    const currentMoment = moment().tz('America/New_York');
    const isDaylightSavings = currentMoment.isDST();
    const timezoneAbbr = isDaylightSavings ? 'EDT' : 'EST';  // Check if it's daylight savings time
    return currentMoment.format('YYYY-MM-DD hh:mm:ss.SSS A') + ' ' + timezoneAbbr;
  }
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    estTimestamp
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        estTimestamp,
        align(),
        printf(info => {
          return `[${info.timestamp}] ${info.level}: ${info.message}${info.stack ? `\nStack trace: ${info.stack}` : ''}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: path.join(logDirectory, 'combined.log'),
      format: combine(
        estTimestamp,
        json()  // Log as JSON for file
      ),
    }),
    new GroupMeTransport()
  ],
});

module.exports = logger;

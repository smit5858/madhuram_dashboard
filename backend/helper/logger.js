const { createLogger, format, transports } = require("winston");
require("winston-daily-rotate-file");

const errorConsoleTransport = new transports.Console({
  format: format.combine(
    format.colorize(),
    format.errors({ stack: true }),
    format.splat(),
    format.printf(
      (info) => `${info.timestamp} - ${info.level}: ${info.message}`
    )
  ),
});

const createFileTransport = (level, filename) => {
  return new transports.DailyRotateFile({
    level,
    dirname: `public/logs/${level}`,
    filename: `${filename}-%DATE%.log`,
    datePattern: "DD-MM-YYYY",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "14d",
    format: format.combine(
      format.timestamp({ format: "DD-MM-YYYY HH:mm:ss" }),
      format.json()
    ),
  });
};

const customLevels = {
  levels: {
    error: 0,
    info: 1,
    notification: 2,
  },
  colors:{
    error: "red",
    info: "green",
    notification: "yellow",
  }
};

const logger = createLogger({
  levels: customLevels.levels,
  format: format.combine(
    format.timestamp({
      format: "DD-MM-YYYY HH:mm:ss",
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    errorConsoleTransport,
    createFileTransport("error", "error"),
    createFileTransport("info", "info"),
    createFileTransport("notification", "notification"),
  ],
  exitOnError: false,
  silent: false,
  handleExceptions: true,
});

module.exports = logger;
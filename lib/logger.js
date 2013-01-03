/**
* Forked from Mikeal Rogers Stoopid project at http://github.com/mikeal/stoopid.
*/
var util = require('util');
var os = require('os');
var colors = require('colors');
var fs = require('fs');
var moment = require('moment');
var lconfig = require('lconfig');

var rlevels = {};
var levels = {
  silly: 10,
  verbose: 100,
  debug: 200,
  info: 300,
  warn: 400,
  error: 500
};

colors.setTheme({
  silly: 'rainbow',
  input: 'grey',
  verbose: 'green',
  prompt: 'grey',
  info: 'cyan',
  data: 'grey',
  help: 'cyan',
  warn: 'yellow',
  debug: 'green',
  error: 'red'
});

function Handler() {}

Handler.prototype.msg = function () {
  return util.format.apply(this, arguments);
};

function Console() {
  this.filter = levels[lconfig.logging && lconfig.logging.level];
}

util.inherits(Console, Handler);

Console.prototype.prefix = function (logger) {
  return '[' + moment().format('MM/DD/YYYY HH:mm:ss').grey + '][' +
    os.hostname().grey + '][' + logger.name.cyan + '] ';
};

if (process.env.SUPPRESS_TIMESTAMPS) {
  Console.prototype.prefix = function (logger) {
    return '[' + logger.name.cyan + '] ';
  };
}

Console.prototype.onLog = function (logger, level, args) {
  if (level < this.filter) return;
  var msg = util.format.apply(this, args);
  msg = msg[rlevels[level]] || msg;
  msg = this.prefix(logger) + msg;
  if (logger.stripColors) msg = msg.stripColors;
  process.stdout.write(msg + '\n');
};

if (process.env.SUPPRESS_LOGS) {
  Console.prototype.onLog = function () {};
}

function File(path) {
  this.filter = -1;
  this.path = path;
  this.writer = fs.createWriteStream(path, { flags: 'a+' });
}

util.inherits(File, Handler);

File.prototype.onLog = function (logger, level, args) {
  if (level < this.filter) return;
  var msg = this.msg.apply(this, args);
  msg = '[' + logger.name + '] ' + msg;
  this.writer.write(msg + '\n');
};

function Logger(name, parent) {
  var self = this;

  self.stripColors = false;

  if (process.env.SUPPRESS_COLORS) {
    self.stripColors = true;
  }

  self.name = name;
  self.parent = parent;
  self._l = false;

  if (parent) {
    self.handlers = parent.handlers;
  } else {
    self.handlers = [];
  }
}

Logger.prototype.logger = function (name) {
  return new Logger(name, this);
};

Logger.prototype._log = function () {
  var args = Array.prototype.slice.apply(arguments);
  var self = this;
  var level;

  if (!self._l) {
    level = args.shift();
  } else {
    level = self._l;
  }

  self.handlers.forEach(function (h) {
    h.onLog(self, level, args);
  });
};

function defineLevel(level) {
  Logger.prototype[level] = function () {
    this._l = levels[level];
    this._log.apply(this, arguments);
    this._l = false;
  };

  rlevels[levels[level]] = level;
}

for (var level in levels) {
  defineLevel(level);
}

Logger.prototype.log = Logger.prototype.info;
Logger.prototype.dir = Logger.prototype.log;

Logger.prototype.time = function (label) {
  this.times = {};
  this.times[label] = Date.now();
};

Logger.prototype.timeEnd = function (label) {
  var duration = Date.now() - this.times[label];

  this.log('%s: %dms', label, duration);
};

var realError = Logger.prototype.error;

Logger.prototype.error = function (err) {
  if (typeof(err) === 'string') this.trace(err);
  else realError.apply(this, [err.stack]);
};

Logger.prototype.trace = function (label) {
  // TODO probably can to do this better with V8's debug object once that is
  // exposed.
  var err = new Error();
  err.message = label || '';
  if (!label) err.name = 'Trace';

  Error.captureStackTrace(err, Logger.prototype.trace);

  realError.apply(this, [err.stack]);
};

Logger.prototype.assert = function (expression) {
  if (!expression) {
    var arr = Array.prototype.slice.call(arguments, 1);
    require('assert').ok(false, util.format.apply(this, arr));
  }
};

Logger.prototype.errorObject = function (err) {
  this.error(err);
  return err;
};

var handlerMap = {
  console: Console,
  file: File
};

Logger.prototype.addHandler = function (handler, options) {
  if (typeof handler === 'string') {
    if (!handlerMap[handler]) {
      throw new Error('no handler named ' + handler);
    }

    handler = new handlerMap[handler](options);
  }

  this.handlers.push(handler);
};

module.exports = new Logger('process');

module.exports.addHandler('console');

/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var fs = require('fs');
var path = require('path');
var _ = require('lodash');

function setBase() {
  exports.lockerBase = 'http://' + exports.lockerHost +
    (exports.lockerPort !== 80 ? (':' + exports.lockerPort) : '');

  exports.externalBase = 'http';

  if (exports.externalSecure === true ||
    (exports.externalPort === 443 &&
      exports.externalSecure !== false)) {
    exports.externalBase += 's';
  }

  exports.externalBase += '://' + exports.externalHost +
    (exports.externalPort !== 80 &&
      exports.externalPort !== 443 ? ':' + exports.externalPort : '');

  if (exports.externalPath) {
    exports.externalBase += exports.externalPath;
  }
}

exports.load = function () {
  if (exports.loaded) {
    return;
  }

  // Allow overriding
  var configDir = process.env.LOCKER_CONFIG || 'Config';

  var configPath = process.env.CONFIG_PATH || path.join(configDir,
    'config.json');
  var defaultsPath = path.join(configDir, 'defaults.json');

  var defaults;

  if (fs.existsSync(defaultsPath)) {
    defaults = JSON.parse(fs.readFileSync(defaultsPath));
  }

  if (!defaults) {
    console.error('Unable to load configuration defaults from', defaultsPath);

    process.exit(1);
  }

  var options;

  if (fs.existsSync(configPath)) {
    options = JSON.parse(fs.readFileSync(configPath));
  }

  if (!options) {
    options = {};

    console.warn('Unable to load configuration from %s, using defaults only.',
      configPath);
  }

  // Merge the defaults and options into exports
  exports = _.merge(exports, defaults, options);

  // There's still some magic for lockerPort
  if (exports.lockerPort === 0) {
    exports.lockerPort = 8042 + Math.floor(Math.random() * 100);
  }

  // And some magic for externalPort
  if (options && options.externalPort) {
    exports.externalPort = options.externalPort;
  } else if (options && options.externalSecure) {
    exports.externalPort = 443;
  } else {
    exports.externalPort = exports.lockerPort;
  }

  setBase();

  if (fs.existsSync(path.join(configDir, 'apikeys.json'))) {
    exports.apikeysPath = path.join(configDir, 'apikeys.json');
  }

  exports.loaded = true;
};

exports.load();

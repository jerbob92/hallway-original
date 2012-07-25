/*
 *
 * Copyright (C) 2011, The Locker Project
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

// A place for hallwayd.js to populate settings
var fs = require('fs');
var path = require('path');
var lutil = require('lutil');

function setBase() {
  exports.lockerBase = 'http://' + exports.lockerHost;

  if (exports.lockerPort && exports.lockerPort !== 80) {
    exports.lockerBase += ':' + exports.lockerPort;
  }

  exports.externalBase = 'http';

  if (exports.externalSecure === true ||
    (exports.externalPort === 443 &&
      exports.externalSecure !== false)) {
    exports.externalBase += 's';
  }

  exports.externalBase += '://' + exports.externalHost;

  if (exports.externalPort &&
    exports.externalPort !== 80 &&
    exports.externalPort !== 443) {
    exports.externalBase += ':' + exports.externalPort;
  }

  if (exports.externalPath) {
    exports.externalBase += exports.externalPath;
  }
}

function setFromEnvs() {
  var i;
  for (i in process.env) {
    if (i.indexOf('LCONFIG_') === 0) {
      var value = process.env[i];

      i = i.substring(8);

      var keys = i.split('_');
      var obj = exports;

      var j;
      for (j = 0; j < keys.length; j++) {
        var key = keys[j];

        if (j === keys.length - 1) {
          obj[key] = value;

          continue;
        }

        if (!obj[key]) {
          obj[key] = {};
        }

        obj = obj[key];
      }
    }
  }

  if (process.env.PORT) {
    exports.lockerPort = process.env.PORT;
  }
}

exports.load = function(filepath) {
  if (exports.loaded) {
    return;
  }

  var configPath = filepath;

  // allow overriding
  var configDir = process.env.LOCKER_CONFIG || 'Config';

  var defaultsPath = path.join(configDir, 'defaults.json');

  if (process.env.LOCKER_CONFIG) {
    console.info('env override set, config path is', process.env.LOCKER_CONFIG);

    defaultsPath = path.join(process.env.LOCKER_CONFIG, 'defaults.json');
    configPath = path.join(process.env.LOCKER_CONFIG, 'config.json');
  }

  var defaults;

  if (path.existsSync(defaultsPath)) {
    defaults = JSON.parse(fs.readFileSync(defaultsPath));
  }

  if (!defaults) {
    console.error('Unable to load configuration defaults from', defaultsPath);

    process.exit(1);
  }

  var options = {};

  if (path.existsSync(configPath)) {
    options = JSON.parse(fs.readFileSync(configPath));
  }

  // Merge the defaults and options into exports
  exports = lutil.extend(true, exports, defaults, options);

  if (path.existsSync(path.join(configDir, 'apikeys.json'))) {
    exports.apikeysPath = path.join(configDir, 'apikeys.json');
  }

  if (exports.lockerPort === 0) {
    exports.lockerPort = 8042 + Math.floor(Math.random() * 100);
  }

  if (exports.externalSecure && !exports.externalPort) {
    exports.externalPort = 443;
  } else {
    exports.externalPort = exports.lockerPort;
  }

  setBase();

  // load trusted public keys
  var kdir = path.join(path.dirname(filepath), "keys");

  exports.keys = [];

  if (path.existsSync(kdir)) {
    var keys = fs.readdirSync(kdir);

    keys.forEach(function(key) {
      if (key.indexOf(".pub") === -1) {
        return;
      }

      exports.keys.push(fs.readFileSync(path.join(kdir, key)).toString());
    });
  }

  setFromEnvs();

  exports.loaded = true;
};

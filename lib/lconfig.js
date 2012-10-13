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
var lutil = require('lutil');

function setBase() {
  exports.lockerBase = 'http://' + exports.lockerHost +
    (exports.lockerPort && exports.lockerPort !== 80 ?
      ':' + exports.lockerPort : '');

  exports.externalBase = 'http';

  if (exports.externalSecure === true ||
    (exports.externalPort === 443 &&
      exports.externalSecure !== false)) {
    exports.externalBase += 's';
  }

  exports.externalBase += '://' + exports.externalHost +
    (exports.externalPort &&
      exports.externalPort !== 80 &&
      exports.externalPort !== 443 ? ':' + exports.externalPort : '');

  if (exports.externalPath) {
    exports.externalBase += exports.externalPath;
  }
}

function setFromEnvs() {
  for (var i in process.env) {
    if (i.indexOf('LCONFIG_') === 0) {
      var value = process.env[i];

      i = i.substring(8);

      var keys = i.split('_');
      var obj = exports;

      for (var j = 0; j < keys.length; j++) {
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

exports.load = function() {
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
    console.error('Unable to load configuration from', configPath);

    process.exit(1);
  }

  // Merge the defaults and options into exports
  exports = lutil.extend(true, exports, defaults, options);

  // There's still some magic for lockerPort
  if (exports.lockerPort === 0) {
    exports.lockerPort = 8042 + Math.floor(Math.random() * 100);
  } else if (!exports.lockerPort) {
    exports.lockerPort = 8042;
  }

  // And some magic for externalPort
  if (options.externalPort) {
    exports.externalPort = options.externalPort;
  } else if (options.externalSecure) {
    exports.externalPort = 443;
  } else {
    exports.externalPort = exports.lockerPort;
  }

  setFromEnvs();
  setBase();

  if (fs.existsSync(path.join(configDir, 'apikeys.json'))) {
    exports.apikeysPath = path.join(configDir, 'apikeys.json');
  }

  // Load trusted public keys
  var kdir = path.join(configDir, 'keys');

  if (fs.existsSync(kdir)) {
    var keys = fs.readdirSync(kdir);

    keys.forEach(function(key) {
      if (key.indexOf(".pub") === -1) {
        return;
      }

      exports.keys.push(fs.readFileSync(path.join(kdir, key)).toString());
    });
  }

  exports.loaded = true;
};

exports.load();

var logger = require('logger').logger('anubis');
var nexusClient = require("nexusClient");
var lconfig = require("lconfig");

// system to batch archive api requests from an app per account
var tomb = [];
var reaperTimer;

function getClientIp(req) {
  var ipAddress;

  // Amazon EC2 / Heroku workaround to get real client IP
  var forwardedIpsStr = req.headers && req.headers['x-forwarded-for'];

  if (forwardedIpsStr) {
    // 'x-forwarded-for' header may return multiple IP addresses in
    // the format: "client IP, proxy 1 IP, proxy 2 IP" so take the
    // the first one
    var forwardedIps = forwardedIpsStr.split(',');

    ipAddress = forwardedIps[0];
  }

  if (!ipAddress) {
    // Ensure getting client IP address still works in
    // development environment
    ipAddress = req.connection && req.connection.remoteAddress;
  }

  return ipAddress;
}

exports.log = function (req, js) {
  if ((req && typeof req !== 'object') ||
    (js && typeof js !== 'object')) {
    return logger.warn('anubis called with invalid args');
  }

  if (!req) req = {};
  if (!js) js = {};

  if (!((js.app && js.act) || req._authsome)) {
    return logger.warn('anubis isn\'t authsome');
  }

  if (!req._authsome || !req._authsome.app) return logger.debug("Nothing to log here");
  if (!lconfig.anubis || !lconfig.anubis.allowedApps || lconfig.anubis.allowedApps.indexOf(req._authsome.app) === -1) {
    return logger.debug("Not logging anubis, app is not allowed.");
  }

  // fill in log entry
  js.at = Date.now();
  js.act = js.act || req._authsome.account;
  js.app = js.app || req._authsome.app;
  js.type = js.type || 'log'; // sanity
  js.path = js.path || req.url;
  js.from = js.from || getClientIp(req);
  js.query = {};

  if (req.query) {
    Object.keys(req.query).forEach(function (key) {
      if (key !== 'access_token') {
        js.query[key] = req.query[key];
      }
    });
  }

  if (req.method && req.method.toLowerCase() !== 'get') {
    js.method = req.method.toLowerCase();
  }

  if (js.path && js.path.indexOf('?') !== -1) {
    js.path = js.path.substr(0, js.path.indexOf('?'));
  }

  return tomb.push(js);
};

exports.reap = function (callback) {
  if (tomb.length === 0) return;

  var doom = tomb;

  tomb = [];

  logger.debug('reaping', doom.length);

  var bundle = {};

  // munge the raw list into batch groupings per account@app
  doom.forEach(function (js) {
    var key = [js.act, js.app].join('@');
    if (!bundle[key]) bundle[key] = [];
    bundle[key].push(js);
    delete js.app; // don't need to store this, present in idr
  });

  Object.keys(bundle).forEach(function (key) {
    var parts = key.split('@');
    var act = parts[0];
    var app = parts[1];
    var entry = {
      data: bundle[key],
      at: Date.now()
    };

    // TODO also add other types if the set contains more than log? entry.types
    // needs refactoring first
    // idr is global to app by default
    entry.idr = 'logs:' + app + '/anubis#' + act + '.' + entry.at;

    // also change the base to include the account so it's getRange'able that
    // way (bit of a hack :/)
    entry.types = {
      logs: { auth: act }
    };

    nexusClient.batchSmartAdd([entry], function (err, result) {
      if (err) {
        logger.warn('Anubis failed to batchSmartAdd');
        logger.error(err);
      }
      if (typeof(callback) === 'function') callback(err, result);
    });
  });
};

reaperTimer = setInterval(exports.reap, 10000);

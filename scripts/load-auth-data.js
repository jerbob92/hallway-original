var async = require('async');
var path = require('path');

var logger = require('logger').logger('load-auth-data');
var profileManager = require('profileManager');

var filename = process.argv[2];

if (!filename) {
  logger.warn('Usage: node load-auth-data.js <file>');
  logger.info('All auth data will be loaded from the file ' +
              'and written to profileManager\'s store');
  process.exit(1);
}

logger.info('Loading auths');
var auths = require(path.join(process.cwd(), filename));
logger.info('Loaded', auths.length, 'auths');

function errorAndQuit(err) {
  logger.error(err);
  process.exit(1);
}

function setAuth(profile, callback) {
  logger.debug('Setting auth for', profile);
  profileManager.allSet(profile, auths[profile], {}, callback);
}

function run() {
  var profiles = Object.keys(auths);
  var queue = async.queue(setAuth, 100);

  queue.drain = function(err) {
    logger.info('Done');
    process.exit(0);
  };

  profiles.forEach(function(profile) {
    queue.push(profile);
  });
}

profileManager.init(run);

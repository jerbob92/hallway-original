var async = require('async');
var path = require('path');

var logger = require('logger').logger('load-auth-data');
var podClient = require('podClient');
var profileManager = require('profileManager');

var filename = process.argv[2];

if (!filename) {
  logger.warn('Usage: node load-auth-data.js <file>');
  logger.info('All auth data will be loaded from the file ' +
              'and written to profileManager\'s store');
  process.exit(1);
}

logger.info('Loading pids');
var pids = require(path.join(process.cwd(), filename));
logger.info('Pids loaded');

function errorAndQuit(err) {
  logger.error(err);
  process.exit(1);
}

function sync(pid, callback) {
  logger.debug('Syncing', pid);
  podClient.syncNow(1, pid, callback);
}

function run() {
  var queue = async.queue(sync, 50);

  queue.drain = function(err) {
    logger.info('Done', err);
    process.exit(0);
  };

  pids.forEach(function(pid) {
    queue.push(pid);
  });
}

profileManager.init(run);

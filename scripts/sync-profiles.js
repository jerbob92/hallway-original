var argv = require('optimist')
  .demand('pod')
  .argv;

var async = require('async');
var path  = require('path');
var _     = require('underscore');

var dal            = require('dal');
var logger         = require('logger').logger('load-auth-data');
var podClient      = require('podClient');
var profileManager = require('profileManager');

function errorAndQuit(err) {
  logger.error(err);
  process.exit(1);
}

function sync(pid, callback) {
  logger.debug('Syncing', pid);
  podClient.syncNow(argv.pod, pid, callback);
}

function getPids(callback) {
  logger.info('Loading profiles');
  dal.query('SELECT id FROM Profiles', {}, function(err, rows) {
    return callback(err, _.pluck(rows, 'id'));
  });
}

function run() {
  logger.info('Syncing all profiles to pod', argv.pod);
  getPids(function(err, pids) {
    if (err) errorAndQuit(err);

    logger.info('Syncing', pids.length, 'profiles');

    var queue = async.queue(sync, 300);

    queue.drain = function(err) {
      logger.info('Done');
      if (err) logger.error(err);
      process.exit(0);
    };

    pids.forEach(function(pid) {
      queue.push(pid);
    });
  });
}

profileManager.init(run);

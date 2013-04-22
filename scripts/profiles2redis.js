var argv = require('optimist')
  .demand('pod')
  .argv;

var async = require('async');
var path  = require('path');
var _     = require('underscore');

var dal            = require('dal');
var lconfig = require('lconfig');
var logger         = require('logger').logger('profiles2redis');
var profileManager = require('profileManager');
var idr = require("idr");
var redis = require("redis");
var rclient = redis.createClient(lconfig.worker.redis.port || 6379,
                                 lconfig.worker.redis.host || "127.0.0.1");

function errorAndQuit(err) {
  logger.error(err);
  process.exit(1);
}

function sync(pid, callback) {
  logger.debug('Syncing', pid);
  var parts = pid.split('@');
  rclient.zadd([parts[1]+"_schedule", 3, parts[0]], callback);
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

rclient.select(3, function (err) {
  profileManager.init(run);
});

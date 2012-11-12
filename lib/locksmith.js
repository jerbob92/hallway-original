var logger = require('logger').logger('locksmith');
var lconfig = require('lconfig');
var redis;

var WORKER_NAME;
var ONE_PROFILE;
// how long before a lock is expired
exports.LOCK_TIMEOUT = 60000;

function lockData() {
  return [Date.now(), WORKER_NAME].join("\t");
}

exports.init = function(workerName, oneProfile) {
  WORKER_NAME = workerName;
  ONE_PROFILE = oneProfile;
  redis = require(lconfig.taskman.redis.driver || 'redis').createClient(
    lconfig.taskman.redis.port,
    lconfig.taskman.redis.host
  );
};

exports.requestLock = function(pid, callback) {
  redis.hsetnx('active', pid, lockData(), callback);
};

// just robin to redis to see if it's busy or expired
exports.isLocked = function(pid, callback) {
  // convenient way to lock to just one profile
  if (ONE_PROFILE && pid !== ONE_PROFILE) return callback(true);
  redis.hget("active", pid, function(err, lock) {
    if (!lock) return callback(false);
    // lock format: "heartbeat-timestamp\tworker-name"
    var bits = lock.split("\t");
    var lockAge = Date.now() - bits[0];
    if (lockAge < exports.LOCK_TIMEOUT) return callback(true, bits);
    // invalid lock, delete it!
    logger.warn("removing expired lock",lock);
    // TODO small race condition here if someone else removed and re-added
    // in between
    exports.clearLock(pid, function() {
      callback(false);
    });
  });
};

exports.clearLock = function(pid, callback) {
  redis.hdel("active", pid, callback);
};

exports.heartbeat = function(pid, callback) {
  exports.isLocked(pid, function(err, lock) {
    if (!lock) return callback('lock missing');
    if (lock.indexOf(WORKER_NAME) === -1) {
      return callback('lock stolen by ' + lock);
    }
    redis.hset('active', pid, lockData(), callback);
  });
};


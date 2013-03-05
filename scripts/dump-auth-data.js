var async = require('async');
var fs = require('fs');

var logger = require('logger').logger('dump-auth-data');
var profileManager = require('profileManager');
var dal = require('dal');

console.log('Required');

var outfile = process.argv[2];
var apps = process.argv.slice(3);

logger.info('Dumping data for ', apps);

if (!outfile || apps.length === 0) {
  logger.warn('Usage: node dump-auth-data.js <outfile> <appID>[, <appId> ...]');
  logger.info('All profiles for the given apps will be loaded, ' +
              'and their auth data will be written as JSON to the outfile.');
  process.exit(1);
}

function errorAndQuit(err) {
  logger.error(err);
  process.exit(1);
}

function getProfiles(apps, callback) {
  var appsIn = apps.map(function(app) {
    return "'" + app + "'";
  }).join(',');
  var sql = 'SELECT DISTINCT profile From Accounts WHERE app IN (' + appsIn + ')';
  dal.query(sql, null, function(err, rows) {
    var profiles = rows.map(function(row) {
      return row.profile;
    });
    return callback(err, profiles);
  });
}

function getAuths(profiles, callback) {
  var auths = [];

  var queue = async.queue(function(profile, cbQueue) {
    logger.debug('Getting auth for', profile);
    profileManager.allGet(profile, function(err, data) {
      logger.debug('Got profile data', err, data);
      if (err) errorAndQuit(err);
      if (data && data.auth) auths.push(data.auth);
      cbQueue();
    });
  }, 1);

  queue.drain = function(err) {
    logger.debug('Done getting auth', err);
    if (err) errorAndQuit(err);
    return callback(null, auths);
  };

  logger.info('Queueing profiles');
  profiles.forEach(function(profile) {
    queue.push(profile, function(){});
  });
}

function writeAuths(auths, callback) {
  fs.writeFile(outfile, JSON.stringify(auths), callback);
}

function run() {
  getProfiles(apps, function(err, profiles) {
    if (err) errorAndQuit(err);
    logger.info('Got', profiles.length, 'profiles');
    logger.debug(profiles);
    getAuths(profiles, function(err, auths) {
      logger.info('All done.');
      writeAuths(auths, process.exit);
    });
  });
}

profileManager.init(run);

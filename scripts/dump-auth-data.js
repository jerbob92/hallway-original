var argv = require('optimist')
  .usage('Usage: $0 --file <file> <appID>[, <appID> ...]')
  .options('limit', {'default': null})
  .options('workers', {'default': 100})
  .demand(['file', '_'])
  .argv;

var async = require('async');
var fs = require('fs');

var logger = require('logger').logger('dump-auth-data');
var profileManager = require('profileManager');
var dal = require('dal');

var apps = argv._;

logger.info('Dumping data for ', apps);

function errorAndQuit(err) {
  logger.error(err);
  process.exit(1);
}

function getProfiles(apps, callback) {
  var appsIn = apps.map(function(app) {
    return "'" + app + "'";
  }).join(',');
  var sql = 'SELECT DISTINCT profile From Accounts WHERE app IN (' + appsIn + ')';
  if (argv.limit) sql += ' LIMIT ' + argv.limit;
  dal.query(sql, null, function(err, rows) {
    var profiles = rows.map(function(row) {
      return row.profile;
    });
    return callback(err, profiles);
  });
}

function getAuths(profiles, callback) {
  var auths = {};

  var queue = async.queue(function(profile, cbQueue) {
    logger.debug('Getting auth for', profile);
    profileManager.allGet(profile, function(err, data) {
      logger.debug('Got profile data', err, data);
      if (err) errorAndQuit(err);
      if (data && data.auth) auths[profile] = data.auth;
      cbQueue();
    });
  }, argv.workers);

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
  fs.writeFile(argv.file, JSON.stringify(auths), callback);
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

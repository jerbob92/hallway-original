var argv = require('optimist')
  .usage('Usage: $0 <appID>[, <appID> ...]')
  .options('limit', {'default': null})
  .options('workers', {'default': 100})
  .demand(['auth', 'pod', '_'])
  .argv;

var async = require('async');
var request = require('request');
var _ = require('underscore');

var logger = require('logger').logger('migrate-profile-data');
var profileManager = require('profileManager');
var dal = require('dal');

var apps = argv._;
var authPieces = argv.auth.split(':');
argv.auth = {
  user: authPieces[0],
  pass: authPieces[1]
};

logger.info('Migrating up to', argv.limit, 'profiles for', apps);

function errorAndQuit(err) {
  logger.error(err);
  process.exit(1);
}

function getProfiles(apps, callback) {
  var appsIn = apps.map(function(app) {
    return "'" + app + "'";
  }).join(',');
  var sql = 'SELECT DISTINCT profile From Accounts WHERE app IN (' + appsIn + ') ORDER BY profile';
  if (argv.limit) sql += ' LIMIT ' + argv.limit;
  dal.query(sql, null, function(err, rows) {
    if (err) errorAndQuit(err);
    var profiles = rows.map(function(row) {
      return row.profile;
    });
    return callback(err, profiles);
  });
}

function podRequest(url, params, callback) {
  url = 'https://lb.pod' + argv.pod + '.pods.singly.com' + url;
  params = _.extend({
    auth: argv.auth,
    json: true
  }, params);
  return request(url, params, function(err, response, body) {
    return callback(err || body.error, body);
  });
}

function ensureProfileExists(profile, callback) {
  podRequest('/profile', {
    qs: {
      pid: profile
    }
  }, callback);
}

function sendProfileData(profile, data, callback) {
  podRequest('/profile', {
    method: 'PUT',
    qs: {
      pid: profile
    },
    json: {
      auth: data.auth
    }
  }, callback);
}

function migrateProfile(profile, cbQueue) {
  logger.debug('Getting auth for', profile);
  profileManager.allGet(profile, function(err, data) {
    if (err) return cbQueue(err);

    ensureProfileExists(profile, function(err) {
      if (err) return cbQueue(err);

      sendProfileData(profile, data, cbQueue);
    });
  });
}

function migrateProfiles(profiles, callback) {
  var queue = async.queue(migrateProfile, argv.workers);
  queue.drain = callback;

  logger.info('Queueing profiles');
  profiles.forEach(function(profile) {
    queue.push(profile, function(err){
      if (err) {
        logger.warn('Error migrating', profile);
        logger.error(err);
      }
    });
  });
  logger.info('Done queueing');
}

function run() {
  getProfiles(apps, function(err, profiles) {
    if (err) errorAndQuit(err);
    logger.info('Got', profiles.length, 'profiles');
    logger.debug(profiles);
    migrateProfiles(profiles, function(err) {
      logger.info('All done.', err);
      process.exit();
    });
  });
}

profileManager.init(run);


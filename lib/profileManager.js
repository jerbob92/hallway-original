var dal = require('dal');
var friends = require('friends');
var dMap = require('dMap');
var entries = require('entries');
var podClient = require('podClient');
var crypto = require('crypto');
var async = require('async');
var logger = require('logger').logger('profileManager');
var lconfig = require('lconfig');
var redisClient = require('redis');
var kvstoreClient = require('kvstore');
var _ = require('underscore');
_.str = require('underscore.string');

var KVSTORE = false;
var role = 'apihost';
var redis = false;

function initKVSTORE(cb) {
  // TODO move riak config to a top level, for now just using the same as taskman
  KVSTORE = kvstoreClient.instance(lconfig.taskman.store.type,
                                   lconfig.taskman.store);
  if (KVSTORE === null) {
    logger.error('Failed to initialize KVSTORE for profiles!');
    process.exit(1);
  }
  cb();
}

function initRedis(cb) {
  if (!lconfig.cache) return cb();
  redis = redisClient.createClient(
      lconfig.cache.redis.port,
      lconfig.cache.redis.host
  );
  redis.on("error", function (err) { logger.error("Redis Error",err); });
  redis.select(lconfig.cache.redis.db, cb);
}

exports.init = function (cbDone) {
  async.parallel([
    initKVSTORE,
    initRedis
  ],
  function(err) {
    cbDone();
  });
};

exports.setRole = function(newRole) {
  role = newRole;
};

// For access during testing
exports._kvstore = function() {
  return KVSTORE;
};

exports.loadProfile = function (id, cbDone) {
  dal.query('SELECT * FROM Profiles WHERE id=?', [id], function(err, rows) {
    return cbDone(err, (rows ? rows[0] : null));
  });
};

function createProfile(id, cbDone) {
  if (role === 'pod' || !lconfig.pods.enabled || _.str.include(id, '@devices')) {
    return createProfileLocal(id, cbDone);
  }

  return createProfileRemote(growingPodID(), id, cbDone);
}

function createProfileLocal(data, cbDone) {
  if (typeof(data) === 'string') data = {id: data};

  data.service = data.id.split('@')[1];

  var fields = ['id', 'service'];
  if (data.pod) fields.push('pod');

  var values = [];
  var binds  = [];

  fields.forEach(function(field) {
    values.push(data[field]);
    binds.push('?');
  });

  var sql =
    'INSERT INTO Profiles (' + fields.join(',') +  ')' +
    ' values (' + binds.join(',') + ')';

  dal.query(sql, values, function(err) {
    if (err) return cbDone(err);

    var profile = _.extend({
      auth: {},
      config: {}
    }, data);
    return cbDone(null, profile);
  });
}

function createProfileRemote(pod, id, cbDone) {
  logger.debug('Creating remote profile', pod, id);
  podClient.createProfile(pod, id, function(err, profile) {
    if (err) return cbDone(err);

    createProfileLocal({
      id: id,
      pod: pod
    }, cbDone);
  });
}

function growingPodID() {
  // TODO: Pick a real pod ID
  return 1;
}

// fetch all the fields stored for the profile (config and auth currently)
function genGet(id, cbDone) {
  if (!id) return cbDone(new Error('No PID'));

  exports.loadProfile(id, function(err, profile) {
    if (err) return cbDone(err);
    if (!profile) return createProfile(id, cbDone);

    var getFn = (role === 'pod' || !lconfig.pods.enabled || !profile.pod) ?
      genGetLocal : genGetRemote;

    return getFn(profile, cbDone);
  });
}
exports.allGet = genGet;

function genGetRemote(profile, cbDone) {
  logger.debug(role, 'Getting remote profile', profile.pod, profile.id);
  podClient.getProfile(profile.pod, profile.id, function(err, remoteProfile) {
    // The remote profile comes back without a pod ID
    if (remoteProfile) remoteProfile.pod = profile.pod;
    return cbDone(err, remoteProfile);
  });
}

function genGetLocal(profile, cbDone) {
  logger.debug('Getting local profile', profile.id);
  if (!KVSTORE) return cbDone(new Error('KVSTORE not initialized'));
  KVSTORE.get('profiles', profile.id, {}, function(err, data) {
    // Return the full object, not just auth and config
    return cbDone(err, _.extend(profile, data));
  });
}

exports.configGet = function(id, cbDone) {
  genGet(id, function(err, obj) {
    cbDone(err, obj && obj.config);
  });
};

// get/set the stored auth/config info if any, optionally app specific
exports.authGet = function(id, app, cbDone) {
  function cberr(err){
    logger.warn('authGet failed: %s %s %j', id, app, err);
    cbDone(err);
  }

  genGet(id, function(err, obj){
    if (err) return cberr(err);
    if (!obj || !obj.auth) return cberr('missing auth info');
    // if no app-specific auth
    var auth = obj.auth;
    if (!app) return cbDone(null, auth);
    if (!auth.apps || !auth.apps[app]) return cberr('no auth for that app');
    // merge up the app stuff and return it!
    Object.keys(auth.apps[app]).forEach(function(key){
      auth[key] = auth.apps[app][key];
    });
    cbDone(null, auth);
  });
};

// do magic to store auth per app
exports.authSet = function(id, app, newAuth, cbDone) {
  if (!newAuth.apps) newAuth.apps = {};

  // Don't want to create a circular object
  newAuth.apps[app] = JSON.parse(JSON.stringify(newAuth));

  // Don't want these in the app-specific section
  ['apps', 'pid', 'profile'].forEach(function(key) {
    delete newAuth.apps[app][key];
  });

  newAuth.apps[app].at = Date.now();

  exports.allSet(id, newAuth, null, cbDone);
};

exports.allSet = function(id, newAuth, newConfig, cbDone) {
  logger.debug('Setting profile data for', id);
  exports.loadProfile(id, function(err, profile) {
    if (err) return cbDone(err);
    if (!profile) return cbDone(new Error('No profile found: ' + id));

    if (profile.pod) allSetRemote(profile.pod, id, newAuth, newConfig, cbDone);
    else allSetLocal(id, newAuth, newConfig, cbDone);
  });
};

function allSetRemote(pod, id, newAuth, newConfig, cbDone) {
  logger.debug('Setting remote profile data', pod, id);
  podClient.mergeProfileData(pod, id, {
    auth: newAuth,
    config: newConfig
  }, cbDone);
}

function allSetLocal(id, newAuth, newConfig, cbDone) {
  logger.debug('Setting local profile data', id);
  if (newAuth || newConfig) {
    genGet(id, function (err, profile) {
      if (err) return cbDone(err);
      if (!profile) return cbDone(new Error('No profile found: ' + id));

      if (!profile.auth) profile.auth = {};
      if (!profile.config) profile.config = {};

      if (newAuth) {
        // The apps object needs to be merged independently
        var newApps = newAuth.apps;
        delete newAuth.apps;

        if (!profile.auth.apps) profile.auth.apps = {};
        _.extend(profile.auth.apps, newApps);

        _.extend(profile.auth, newAuth);
      }

      if (newConfig) _.extend(profile.config, newConfig);

      KVSTORE.put('profiles', id, profile, cbDone);
    });
  } else {
    cbDone();
  }
}

exports.reset = function(id, cbDone) {
  exports.loadProfile(id, function(err, profile) {
    if (err) return cbDone(err);
    if (!profile) return cbDone(new Error('No profile found: ' + id));

    if (profile.pod) return resetRemote(profile.pod, id, cbDone);
    else return resetLocal(id, cbDone);
  });
};

function resetRemote(pod, id, cbDone) {
  podClient.resetProfileConfig(pod, id, cbDone);
}

function resetLocal(id, cbDone) {
  genGet(id, function(err, profile) {
    if (err) return cbDone(err);
    profile.config = {};
    KVSTORE.put('profiles', id, profile, cbDone);
  });
}

exports.cacheProfile = function(pid, data) {
  if (!redis) return false;
  var key = 'authCache:' + pid;
  logger.debug('save self to auth cache', key);
  redis.setex(key, 60, JSON.stringify(data), function (err) {
    if (err) logger.warn("Failed to save profile in redis", key, err);
  });
};

// shared function for /profile pattern
// options are { app:required, auth:truefalse, fresh:truefalse, full:truefalse }
exports.genProfile = function genProfile(profiles, options, cbDone)
{
  var bases = [];
  var pids = [];

  profiles.forEach(function (x) {
    var pid = (typeof x === 'object') ? x.profile : x;
    pids.push(pid);
    var type = dMap.defaults(pid.split('@')[1], 'self') || 'data';
    bases.push(type + ':' + pid + '/self');
  });

  if (bases.length === 0) return cbDone('No data or profile found');

  var ret = {
    id: options.account,
    services: {}
  };
  var cached = [];
  async.forEach(pids, function(pid, cb) {
    if (!redis) return cb();
    var key = 'authCache:'+pid;
    redis.get(key, function (err, results) {
      if (err) return cb(err);
      if (!results) return cb();
      logger.debug('Constructing profile from cache', key);
      var items;
      try {
        items = JSON.parse(results);
      } catch (E) {
        logger.warn('Failed to parse result from profile cache', key, E);
      }
      _.each(items, function(profile, idr){
        var item = {
          idr: idr,
          data: profile[0]
        };
        cached.push(idr);
        friends.contactMerge(ret, item, options);
      });
      return cb();
    });
  }, function(err) {
    if (err) logger.error('error sending results for services from cache', err);

    // update bases to those not found in the cache
    bases = _.difference(bases, cached);
    entries.runBases(bases, options, function (item) {
      friends.contactMerge(ret, item, options);
    }, function (err) {
      if (err) logger.error('error sending results for services', err);

      if (ret.email) {
        ret.gravatar = 'https://www.gravatar.com/avatar/' +
          crypto.createHash('md5').update(ret.email.toLowerCase()).digest('hex');
      }

      if (!options.auth) return cbDone(null, ret);
      getAuthsFromPIDs(pids, options, function (err, auths) {
        for (var service in auths) {
          if (!ret.services[service]) ret.services[service] = {};
          ret.services[service].auth = auths[service];
        }
        return cbDone(null, ret);
      });
    });
  });
};

function getAuthsFromPIDs(pids, options, cbDone) {
  var auths = {};

  async.forEach(pids, function (pid, cbPID) {
    var service = pid.split('@')[1];
    exports.authGet(pid, options.app, function (err, auth) {
      auths[service] = {};
      if (err) {
        auths[service].error = err;
        return cbPID();
      }
      // add timestamps, might be useful!
      if (auth.accounts && auth.accounts[options.account]) auths[service].at = auth.accounts[options.account];
      // slightly heuristic
      if (auth.token) {
        if (typeof auth.token === 'string') {
          auths[service].token = auth.token;
          if (typeof auth.tokenSecret === 'string') {
            auths[service].token_secret = auth.tokenSecret;
          } else if (typeof auth.token_secret === 'string') {
            auths[service].token_secret = auth.token_secret;
          }
        } else if (auth.token.oauth_token && auth.token.oauth_token_secret) {
          auths[service] = {
            token: auth.token.oauth_token,
            token_secret: auth.token.oauth_token_secret
          };
        } else auths[service] = auth.token;
      }
      else if (auth.accessToken) auths[service].accessToken = auth.accessToken;

      // clear out instagram's user field
      if (auths[service].user) delete auths[service].user;
      cbPID();
    });
  }, function (err) {
    cbDone(err, auths);
  });
}

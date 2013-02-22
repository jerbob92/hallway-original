var dal = require('dal');
var friends = require('friends');
var dMap = require('dMap');
var entries = require('entries');
var crypto = require('crypto');
var async = require('async');
var logger = require('logger').logger("profileManager");
var lconfig = require('lconfig');
var redisClient = require('redis');
var kvstoreClient = require('kvstore');
var _ = require('underscore');

var KVSTORE = false;
var redis = false;

function initKVSTORE(cb) {
  // TODO move riak config to a top level, for now just using the same as taskman
  KVSTORE = kvstoreClient.instance(lconfig.taskman.store.type,
                                   lconfig.taskman.store);
  if (KVSTORE === null) {
    logger.error("Failed to initialize KVSTORE for profiles!");
    process.exit(1);
  }
  cb();
}

function initRedis(cb) {
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

// fetch all the fields stored for the profile (config and auth currently)
function genGet(id, cbDone) {
  exports.genGetWithoutCreate(id, function (err, profile) {
    if (err || profile) {
      return cbDone(err, profile);
    } else {
      // No profile data was found in the KVSTORE.
      // Make sure it exists in the Profiles table.
      return ensureProfileExists(id, function(insertErr) {
        // If the row is brand new, we have no auth or config data
        return cbDone(insertErr, {
          auth: {},
          config: {}
        });
      });
    }
  });
}

exports.genGetWithoutCreate = function(id, cbDone) {
  if (!id) return cbDone("no pid!");
  if (!KVSTORE) return cbDone("not initialized!");
  KVSTORE.get('profiles', id, {}, function(err, profile) {
    return cbDone(err, profile);
  });
};

function ensureProfileExists(id, cbDone) {
  var sql = "INSERT IGNORE INTO Profiles (id, service) VALUES (?, ?)";
  var service = id.split('@')[1];

  var insert = dal.query(sql, [id, service], function(err, rows) {
    if (err) logger.warn(err, insert);
    return cbDone(err);
  });
}

// get/set the stored auth/config info if any, optionally app specific
exports.authGet = function(id, app, cbDone) {
  function cberr(err){
    logger.warn("authGet failed: %s %s %j", id, app, err);
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

// do magic to store auth per app when given
exports.authSet = function(id, js, app, cbDone) {
  genGet(id, function(err, pfields) {
    if (err) return cbDone(err, js);

    var newAuth = js;
    if (pfields && pfields.auth && Object.keys(pfields.auth).length) {
      // merge new into old
      newAuth = pfields.auth;
      Object.keys(js).forEach(function(key) {
        // don't merge the apps key, we'll do that later
        if (key === "apps") return;
        newAuth[key] = js[key];
      });
    }

    if (app) {
      // gross, but need to keep track of all the access tokens, etc per app
      // so we store them each in their own key. This updates just the current
      // one we are working with.
      var copy = JSON.parse(JSON.stringify(js));
      delete copy.profile;
      delete copy.pid;
      delete copy.apps;
      copy.at = Date.now();
      if (!newAuth.apps) newAuth.apps = {};

      // this just puts the app-specific stuff (tokens, api keys, account #s)
      // into the auth.apps[app] field for safe keeping
      newAuth.apps[app] = copy;
    }
    pfields.auth = newAuth;
    KVSTORE.put("profiles", id, pfields, cbDone);
  });
};

exports.configGet = function(id, cbDone) {
  genGet(id, function(err, obj){
    cbDone(err, obj && obj.config);
  });
};

exports.configSet = function(id, val, cbDone) {
  genGet(id, function(err, pfields) {
    if (err) return cbDone(err);
    if (!pfields.config) pfields.config = {};
    // TODO, does config updating depend on being a subset and merged yet? (seems harmless?)
    Object.keys(val).forEach(function(key){
      pfields.config[key] = val[key];
    });
    KVSTORE.put("profiles", id, pfields, cbDone);
  });
};

exports.allGet = genGet;

exports.allSet = function (id, newAuth, newConfig, cbDone) {
  if (newAuth || newConfig) {
    genGet(id, function (err, profile) {
      if (err) return cbDone(err);
      if (!profile) return cbDone(new Error('No profile found: ' + id));

      if (!profile.auth) profile.auth = {};
      if (!profile.config) profile.config = {};

      if (newAuth) _.extend(profile.auth, newAuth);
      if (newConfig) _.extend(profile.config, newConfig);
      KVSTORE.put("profiles", id, profile, cbDone);
    });
  } else {
    cbDone();
  }
};

exports.reset = function(id, cbDone) {
  genGet(id, function(err, profile) {
    if (err) return cbDone(err);
    profile.config = {};
    KVSTORE.put("profiles", id, profile, cbDone);
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

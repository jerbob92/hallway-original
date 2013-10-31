/*
 *
 * Copyright (C) 2011, Singly, Inc.
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

var acl = require('acl');
var anubis = require('anubis');
var apiKeysLib = require('apiKeys');
var async = require('async');
var authManager = require('authManager');
var connect = require('connect');
var dal = require('dal');
var dMap = require('dMap');
var entries = require('entries');
var express = require('express');
var hostStatus = require('host-status').status;
var idr = require('idr');
var ijod = require('ijod');
var lconfig = require('lconfig');
var logger = require('logger').logger('webservice');
var lutil = require('lutil');
var middleware = require('api-host/middleware');
var multi = require('multi');
var path = require('path');
var posting = require('posting');
var profileManager = require('profileManager');
var qix = require('qix');
var request = require('request');
var resources = require('api-host/resources');
var servezas = require('servezas');
var tokenz = require('tokenz');
var urllib = require('url');

var _ = require('underscore');

_.str = require('underscore.string');
_.mixin(_.str.exports());

var total = 0;

var hallway = exports.api = express();
var optionsRouter = new express.Router();

function setupOptionsRoutes() {
  var options = {};

  // Build up the list of HTTP verbs that each path responds to
  Object.keys(hallway.routes).forEach(function (verb) {
    hallway.routes[verb].forEach(function (route) {
      // Let endpoints handle their own OPTIONS if they'd like (proxy, for
      // example)
      var providesOwnOptions = hallway.routes.options &&
        hallway.routes.options.some(function (optionsRoute) {
        return optionsRoute.path === route.path;
      });

      if (providesOwnOptions) {
        return;
      }

      if (!options[route.path]) {
        options[route.path] = [];
      }

      options[route.path].push(verb.toUpperCase());
    });
  });

  // Answer OPTIONS requests for those paths with the appropriate verbs
  Object.keys(options).forEach(function (path) {
    optionsRouter.route('options', path, function (req, res) {
      res.set('Allow', options[path].join(', '));
      res.send(200);
    });
  });
}

hallway.use(middleware.addErrorFns);
hallway.use(middleware.addGraphiteFns);

hallway.use(middleware.defaultVersion);

hallway.use(middleware.incrementApiHits);
hallway.use(middleware.incrementSdkMetrics);
hallway.use(middleware.logRequestDurations);

hallway.use(middleware.parseOrPassRawBody);
hallway.use(middleware.cors);

hallway.use(connect.cookieParser());

hallway.use(tokenz.login);

hallway.use(function respondToOptions(req, res, next) {
  if (req.method !== 'OPTIONS') {
    return next();
  }

  var route = optionsRouter.matchRequest(req);

  if (route) {
    return route.callbacks[0](req, res);
  }

  next();
});

hallway.use(middleware.secureAllExceptPublicEndpoints);

// Keep track of total hits for each API host, reported in /state
hallway.use(function logAllHits(req, res, next) {
  if (req._authsome) {
    logger.info(req.method, 'APP HIT', req._authsome.app, req._authsome.account,
      req.url);
  } else {
    logger.info(req.method, 'ANON HIT', req.url);
  }
  req._started = Date.now();

  total++;

  next();
});

hallway.get('/oauth/authorize', authManager.start);
hallway.get('/oauth/authenticate', authManager.start);
hallway.post('/oauth/access_token', tokenz.access_token);

// Authentication callbacks
hallway.get('/auth/:id/auth/:app', function (req, res) {
  if (req.params.id === 'facebook' &&
      (!req.query || !req.query.code) && !req.query.error) {
    // redirect, for Facebook Open Graph stuff (see #590)
    return acl.getApp(req.params.app, function (err, app) {
      if (err) return res.send(err, 500);
      if (!app) return res.send(404);
      return res.redirect(app.notes.appUrl);
    });
  }
  authManager.authIsAuth(req.params.id, req.params.app, req, res);
});

hallway.post('/auth/:id/:type/:app', function (req, res) {
  authManager.authIsAuth(req.params.id, req.params.app, req, res);
});

// fallback to use cookie that was set in oauth init stage in authManager
hallway.get('/auth/:id/auth', function (req, res) {
  if (!req.cookies || !req.cookies['auth' + req.params.id]) {
    logger.warn('missing cookie for fallback auth', req.params.id);
    return res.jsonErr('OAuth failed: Missing cookie.');
  }
  logger.debug("authauth here", req.cookies['auth' + req.params.id]);
  authManager.authIsAuth(req.params.id, req.cookies['auth' + req.params.id],
                         req, res);
});

// allows an app to apply their own auth tokens in lieu of the managed auth
hallway.get('/auth/:id/apply', function (req, res) {
  res.increment('apply.id');

  authManager.authApply(req.params.id, req, res);
});

// merge two accounts together
hallway.get('/auth/merge', function (req, res) {
  var source = req.param('source');
  var dest = req.param('dest');
  authManager.authMerge(source, dest, function (err, success) {
    if (err) return res.jsonErr(err);
    res.json(success);
  });
});

// batch account creation
hallway.post('/auth/apply/batch', function (req, res) {
  res.increment('apply.batch');

  var client_id = req.param('client_id');
  var client_secret = req.param('client_secret');
  var accounts = req.param('accounts');

  if (!(client_id && client_secret)) {
    return res.jsonErr('client_id and client_secret parameters are required',
      401);
  }

  if (!Array.isArray(accounts)) {
    return res.jsonErr('accounts parameter must be an array', 400);
  }

  authManager.batchApplyAuth(req, res, client_id, client_secret, accounts,
    function (err, singlyAccounts) {
    if (err) return res.jsonErr(err);
    res.json(singlyAccounts);
  });
});

// Return the client ids for a specific service
hallway.get("/auth/:id/client_id/:service", function (req, res) {
  if (req.params.id && req.params.service) {
    acl.getApp(req.params.id, function (error, appInfo) {
      if (error) {
        return res.jsonErr("Unable to retrieve app information");
      }

      if (appInfo && appInfo.apikeys && appInfo.apikeys[req.params.service]) {
        var resultInfo = {};
        resultInfo[req.params.service] = appInfo.apikeys[req.params.service].appKey;
        res.json(resultInfo);
      } else {
        res.jsonErr("No key found for " + req.params.service, 404);
      }
    });
  } else {
    res.jsonErr("Invalid app or service name.", 400);
  }
});

// Return the reverse auth parameters for a specific service (i.e. Twitter)
hallway.get("/auth/:id/reverse_auth_parameters/:service", function (req, res) {
  if (req.params.id && req.params.service) {

    if (req.params.service !== "twitter") {
      return res.jsonErr("Reverse auth is only available for Twitter.");
    }

    acl.getApp(req.params.id, function (error, appInfo) {
      if (error) {
        return res.jsonErr("Unable to retrieve app information");
      }

      if (appInfo && appInfo.apikeys && appInfo.apikeys[req.params.service]) {
        var requestOptions = {
          url: "https://api.twitter.com/oauth/request_token",
          oauth: {
            consumer_key: appInfo.apikeys[req.params.service].appKey,
            consumer_secret: appInfo.apikeys[req.params.service].appSecret
          },
          form: {
            x_auth_mode: "reverse_auth"
          }
        };

        request.post(requestOptions, function (error, r, body) {
          if (error) {
            return res.jsonErr(error.message);
          }

          var resultInfo = {};
          resultInfo[req.params.service] = body;
          res.json(resultInfo);
        });
      } else {
        res.jsonErr("No key found for " + req.params.service, 404);
      }
    });
  } else {
    res.jsonErr("Invalid app or service name.", 400);
  }
});

// Data access endpoints

// util to xform our legacy _authsome profiles format into something more useful
function profiles(js, services) {
  var ret = [];
  js.forEach(function (x) {
    var parts = x.profile.split('@');
    // if services, it sub-selects just particular ones
    if (services && services.indexOf(parts[1]) === -1) return;
    ret.push(x.profile);
  });
  return ret;
}

hallway.use('/resources', resources);

// XXX: Move into api-host/resources.js?
hallway.get('/resources.json', function (req, res) {
  res.set('Content-Type', 'application/json');

  res.render(__dirname + '/../resources/resources.ejs', {
    locals: { host: lconfig.externalBase },
    layout: false
  });
});

hallway.all('/applications/*', function(req, res){
  var uri = urllib.parse('http://portal.singly.com/api' + req.url);
  uri.query = req.query;

  // Trying to mirror everything needed from the original request
  var arg = { method: req.method, headers:{} };
  arg.uri = urllib.format(uri);
  if(req.headers['basic']) arg.headers['basic'] = req.headers['basic'];

  // POST or PUT only?
  if (req.headers['content-type']) {
    arg.headers['content-type'] = req.headers['content-type'];
    arg.body = req.body;
  }

  arg.json = true;
  request(arg).pipe(res);
});

// PUBLIC! Return convenient list of all available services
hallway.get('/services', function (req, res) {
  res.increment('services.discovery.base');

  var services = servezas.services();
  // convenient way to see if there's default keys active
  Object.keys(services).forEach(function (service) {
    var keys = apiKeysLib.getDefaultKeys(service);
    services[service].hasTestKeys = (keys && keys.appKey) ? true : false;
  });
  res.json(services);
});

// Simple way to get just a single merged profile view
hallway.get('/profile', function (req, res) {
  res.increment('profile');

  var options = {
    app: req._authsome.app,
    account: req._authsome.account,
    auth: lutil.isTrue(req.query.auth),
    fresh: lutil.isTrue(req.query.fresh),
    full: lutil.isTrue(req.query.full)
  };

  profileManager.genProfile(req._authsome.profiles, options,
    function (err, ret) {
    if (err) return res.jsonErr(err);
    res.json(ret);
    anubis.log(req, { count: 1 });
  });
});

// Return convenient list of all profiles auth'd for this account
hallway.get('/profiles', function (req, res) {
  res.increment('profiles');

  var profiles = req._authsome.profiles;
  var ret = {};
  ret.id = req._authsome.account;
  async.forEach(profiles, function (item, cb) {
    // Skip any that don't look right
    if (!item.profile || item.profile.indexOf('@') === -1) {
      return process.nextTick(cb);
    }

    var parts = item.profile.split('@');
    if (!ret[parts[1]]) ret[parts[1]] = [];
    if (!lutil.isTrue(req.query.data) && !lutil.isTrue(req.query.verify)) {
      ret[parts[1]].push(parts[0]);
      return process.nextTick(cb);
    }
    profileManager.authGetAcct(item.profile, req._authsome.app, req._authsome.account, function (err, auth) {
      // handling err further below (and profileManager logs a warning for us)
      if (!lutil.isTrue(req.query.verify)) {
        if (auth) ret[parts[1]].push(auth.profile);
        return cb();
      }
      // if verified, run self synclet!
      var self;
      var wrapper = {id: parts[0]};
      // changes format to wrapper object so it can be validated
      ret[parts[1]].push(wrapper);
      if (!auth) {
        wrapper.error = err;
        return cb();
      }
      try {
        self = require(path.join('services', parts[1], 'self.js'));
      } catch (E) {
        // services w/o synclet are custom/internal ones and just skip this
        wrapper.profile = auth.profile;
        return cb();
      }
      logger.info("running verification self for ", item.profile);
      self.sync({auth: auth, config: {}}, function (err, data) {
        if (!err && (!data || !data.auth)) {
          err = "no error and no profile data returned, empty response";
        }
        if (err) {
          wrapper.error = err;
        } else {
          wrapper.profile = data.auth.profile;
        }
        cb();
      });
    });
  }, function (err) {
    if (err) logger.error("failed to expand data for /profiles ", err);
    anubis.log(req);
    res.json(ret);
  });
});

// a way to make changes to profiles, just delete for now
hallway.post('/profiles', function (req, res) {
  var account = req._authsome.account;
  if (!account) {
    return res.jsonErr('That account does not exist.', 404);
  }
  if (!req.param('delete')) {
    return res.json(lutil.jsonErr('A "delete" parameter is required.', {
      see: "https://singly.com/docs/profiles#Deleting-Profiles"
    }), 400);
  }
  if (req.param('delete') === account) {
    acl.delProfiles(account, function (err) {
      if (err) logger.error(err);
      anubis.log(req);
      // def clear the session cookie too so the old id doesn't stick around
      res.clearCookie('account-' + req._authsome.app);
      res.json(!err);
    });
  } else {
    var profileID = req.param('delete');
    var lastAt = profileID.lastIndexOf('@');
    // split out the service name and the profile id
    if (lastAt > -1) {
      var service = profileID.substring(lastAt);
      var id = profileID.substring(0, lastAt);
      // the profile id is uri encoded in the DB
      // first we decode it in case it was copied in it's encoded form
      id = decodeURIComponent(id);
      // then we encode it to match
      id = encodeURIComponent(id);
      profileID = id + service;
    }
    acl.getProfile(account, profileID, function (err, profile) {
      if (err) logger.error(err);
      if (!profile) {
        return res.jsonErr('That profile is not connected.', 404);
      }
      logger.info("deleting account profiles for " + account,
        profileID,
        req._authsome.profiles
      );
      acl.delProfile(account, profileID, function (err) {
        if (err) logger.error(err);
        anubis.log(req);
        res.json(!err);
      });
    });
  }
});

// delete an account RESTfully
hallway.del('/profiles', function (req, res) {
  logger.info("DELETE account", req._authsome);
  acl.delProfiles(req._authsome.account, function (err) {
    if (err) logger.error(err);
    anubis.log(req);
    res.json({success: true});
  });
});

// delete profiles RESTfully
hallway.del('/profiles/:id', function (req, res) {
  var id = req.params.id;
  var bye = [];
  profiles(req._authsome.profiles).forEach(function (pid) {
    if (pid.indexOf(id) >= 0) bye.push(pid);
  });
  if (bye.length === 0) {
    return res.jsonErr('No matching profiles for ' + id, 404);
  }
  logger.info("DELETE profiles for", req._authsome.account, bye);
  async.forEach(bye, function (pid, cbBye) {
    acl.delProfile(req._authsome.account, pid, function (err) {
      if (err) logger.error(err);
      cbBye();
    });
  }, function () {
    anubis.log(req);
    res.json({success: true});
  });
});


// return the profile for a given service
hallway.get('/profiles/:serviceName', function (req, res) {
  var service = req.params.serviceName;
  if (service === 'self') service = req._authsome.app;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function (item) {
    if (item.profile.indexOf(service) >= 0) pid = item.profile;
  });
  if (service.indexOf('@') > 0) service = service.split('@')[1]; // allow id@service requests
  if (service === req._authsome.app) {
    pid = [req._authsome.account, req._authsome.app].join('@');
  }
  var type = dMap.defaults(service, 'self');
  if (!pid || !type) {
    return res.jsonErr('There is no profile for ' + service, 404);
  }
  // need to get both because built in services have their own type, and
  // custom profiles (above) have a specific one :/
  var bases =  [type + ':' + pid + '/self', 'data:' + pid + '/self'];
  var self;
  profileManager.runBases(bases, {limit: 1, app:req._authsome.app, account:req._authsome.account}, function (item) {
    self = item;
  }, function (err) {
    if (err) logger.warn(err);
    if (!self) {
      profileManager.getCached(pid, function(){}, function(err, profiles) {
        if (err || !profiles) {
          logger.warn('No /profile/* for pid', pid, err);
          return end({error:'profile failed'});
        }
        return end(profiles[0]);
      });
    }
    else return end(self);

    function end(self) {
      anubis.log(req);
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
      if (!req.query.auth) {
        return res.end(entries.toString(self, entries.options(req.query)));
      }
      // be nice and return tokens
      var appID = req._authsome.app;
      profileManager.authGetAcct(pid, appID, req._authsome.account, function (err, auth) {
        if(req.query.auth == lconfig.authSecrets.sign) return res.end(JSON.stringify(auth));
        self.auth = {};
        if (err) self.error = err;
        // slightly heuristic
        if (auth && auth.accessToken) self.auth.accessToken = auth.accessToken;
        if (auth && auth.token) self.auth.token = auth.token;
        if (auth && auth.tokenSecret) self.auth.tokenSecret = auth.tokenSecret;
        return res.end(entries.toString(self, entries.options(req.query)));
      });
    }
  });
});

// return the self profile in the old format
hallway.get('/services/:serviceName/self', function (req, res) {
  var service = req.params.serviceName;
  var profiles = req._authsome.profiles;
  var pid;
  profiles.forEach(function (item) {
    if (item.profile.indexOf(service) >= 0) pid = item.profile;
  });
  var type = dMap.defaults(service, 'self');
  if (!pid || !type) {
    return res.jsonErr('There is no profile for ' + service, 404);
  }
  var bases =  [type + ':' + pid + '/self'];
  var self;
  profileManager.runBases(bases, {limit: 1, app:req._authsome.app, account:req._authsome.account}, function (item) {
    self = item;
  }, function (err) {
    if (err) return res.jsonErr(err, 500);
    if (!self) return res.jsonErr("failed to find self", 404);
    res.json(self);
  });
});

hallway.get('/logout', function (req, res) {
  var appId = req._authsome.app;
  var redirectUri;
  res.clearCookie('account-' + appId);
  acl.getApp(appId, function (err, app) {
    if (err) return res.jsonErr(err);

    if (req.query.redirect_uri) {
      redirectUri = req.query.redirect_uri;
    } else {
      try {
        var redirect = urllib.parse(app.notes.callbackUrl);
        delete redirect.pathname;
        redirectUri = urllib.format(redirect);
      } catch (e) {
        redirectUri = 'https://singly.com/';
      }
    }

    res.redirect(redirectUri);
  });
});

// public health check
hallway.get('/enoch', function (req, res) {
  var good = req.query['true'] || true;
  var bad = req.query['false'] || false;
  if (req.query.fail) return res.json(bad, 500);
  dal.query('select true', [], function (err, row) {
    if (err) return res.json(bad, 500);
    if (!row || !row[0] || row[0].TRUE !== 1) return res.json(bad, 500);
    res.json(good);
  });
});

// public state information
hallway.get('/state', function (req, res) {
  var ret = hostStatus();

  ret.total = total;

  res.json(ret);
});

// get apps for an account
hallway.get('/apps', function (req, res) {
  var account = req._authsome.account;
  acl.getAppsForAccount(account, function (err, js) {
    if (err) return res.jsonErr(err);
    anubis.log(req);
    res.json(js);
  });
});

// get details for a single app
hallway.get('/app/:id', function (req, res) {
  var appId = req.params.id;
  var account = req._authsome.account;
  acl.getAppFor(appId, account, function (err, app) {
    if (err) return res.jsonErr(err);
    anubis.log(req);
    res.json(app);
  });
});

/* Get the number of accounts for a given app. Can later
   be extended to return json of account id to profile ids. */
hallway.get('/app/:id/accounts', function (req, res) {
  var appId = req.params.id;
  var account = req._authsome.account;
  //get to enable ownership check
  acl.getAppFor(appId, account, function (err) {
    if (err) return res.jsonErr(err);
    acl.getAppAccountCount(appId, function (err, count) {
      if (err) return res.jsonErr(err);
      anubis.log(req);
      res.json(count);
    });
  });
});

// create a new app (primarily for a developer, but could be used for anyone
// someday)
hallway.post('/app', middleware.requireJSONBody, function (req, res) {
  // make sure to save who created this!
  req.body.account = req._authsome.account;
  acl.addApp(req.body, function (err, js) {
    if (err) return res.jsonErr(err);
    anubis.log(req);
    res.json(js);
  });
});

function deleteApp(appId, account, req, res) {
  acl.getApp(appId, function (err, app) {
    if (err) return res.jsonErr(err);
    // only the primary person can delete the app
    if (account === app.notes.account) {
      acl.deleteApp(appId, function (err) {
        if (err) return res.jsonErr(err);
        anubis.log(req);
        res.send(200);
      });
    } else if (acl.hasAppPerms(account, app)) {
      res.jsonErr('Only the app creator can delete it', 401);
    } else {
      res.send(404);
    }
  });
}

// delete an app RESTfully
hallway.del('/app/:id', function (req, res) {
  deleteApp(req.params.id, req._authsome.account, req, res);
});

// delete an app using a post request for old html forms
hallway.post('/app/:id', middleware.requireJSONBody, function (req, res, next) {
  // check for special delete field
  if (req.body.method === 'DELETE') {
    deleteApp(req.params.id, req._authsome.account, req, res);
  } else {
    next();
  }
});

// update details for a single app
hallway.post('/app/:id', middleware.requireJSONBody, function (req, res) {
  var appId = req.params.id;
  // load the app
  var account = req._authsome.account;
  acl.getAppFor(appId, account, function (err, app) {
    if (err) return res.jsonErr(err);
    var notes = req.body;
    // this isn't mutable
    notes.account = app.notes.account;
    // this should be preserved if not changed
    if (!Array.isArray(notes.collab) && app.notes.collab) notes.collab = app.notes.collab;
    var apiKeys;
    try {
      apiKeys = (typeof req.body.apiKeys == "object") ? req.body.apiKeys : JSON.parse(req.body.apiKeys);
      lutil.trimObject(apiKeys);
    } catch (E) {}
    if (!apiKeys) return res.jsonErr('Failed to parse API keys');
    delete notes.apiKeys;
    acl.updateApp(appId, notes, apiKeys, function (err) {
      if (err) return res.jsonErr(err);
      anubis.log(req);
      res.send(200);
    });
  });
});

hallway.post('/services/facebook/og/:action', function (req, res) {
  req.params.type = 'og';
  posting.postType(req, res);
});

// generic proxy-authed-to-service util
hallway.all('/proxy/:service/*', function (req, res) {
  var service = req.params.service;

  res.increment('proxy.' + service);

  var pid;
  req._authsome.profiles.forEach(function (item) {
    if (item.profile.indexOf(service) > 0) pid = item.profile;
  });
  if (!pid) {
    return res.jsonErr('There is no profile for ' + service, 404);
  }
  req.url = '/' + req.params[0];
  delete req.query.access_token;
  logger.debug('proxy fetching', req._authsome.app, req.method, service,
    req.url, req.query, req.body);
  profileManager.authGetAcct(pid, req._authsome.app, req._authsome.account, function (err, auth) {
    if (err) return res.jsonErr(err, 401);
    var proxy;
    try {
      proxy = require(path.join('services', service, 'proxy.js'));
    } catch (E) {
      logger.warn(E);
      return res.jsonErr('No proxy available for ' + service, 501);
    }
    anubis.log(req);
    proxy.proxy(auth, req, res);
  });
});

hallway.get('/id/:id', function (req, res) {
  var id = req.params.id || req.url.substr(1);
  logger.debug("fetching " + id);
  if(id.indexOf('@') == -1) return res.jsonErr("invalid id",500);

  var r = idr.parse(id);
  profileManager.authGetAcct(idr.pid(r), req._authsome.app, req._authsome.account, function (err, auth) {
    if(err || !auth) return res.jsonErr(err, 500);
    var ids;
    try {
      ids = require(path.join('services', r.host, 'id.js'));
      ids.sync({auth:auth, id:r.hash, type:r.protocol}, function(err, data){
        if(err || !data) return res.jsonErr(err, 500);
        ret = {idr:idr.toString(r), id:idr.hash(r), data:data, at:dMap.get('at', data, r)};
        return res.json(ret);
      });
    } catch (E) {
      return res.jsonErr(E, 500);
    }
  });
});


hallway.use(middleware.lastResortError);

// This needs to be called after all the routes are defined
setupOptionsRoutes();

exports.startService = function (port, ip, cb) {
  hallway.listen(port, ip, function () {
    cb(hallway);
  });
};

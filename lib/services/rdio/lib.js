var request = require('request');
var OAuth = require('oauth').OAuth;

function makeOAuth(consumerKey, consumerSecret, authorizeCallback) {
  return new OAuth('http://api.rdio.com/oauth/request_token',
   'http://api.rdio.com/oauth/access_token',
    consumerKey,
    consumerSecret,
    '1.0',
    authorizeCallback,
    'HMAC-SHA1'
  );
}

function api(auth, params, cb) {
  var consumerKey = auth.consumerKey;
  var consumerSecret = auth.consumerSecret;
  var oa = makeOAuth(auth.consumerKey, auth.consumerSecret);
  oa.post('http://api.rdio.com/1/', auth.token, auth.tokenSecret, params,
    'application/x-www-form-urlencoded', function(err, body, resp) {
      if (err) return cb(err);
      if (!resp) return cb(new Error('No response from rdio'));
      if (resp.statusCode !== 200) return cb(new Error(resp.statusCode + ' status code from rdio:' + body));
      try {
        body = JSON.parse(body);
      } catch (e) {
        return cb(new Error('Error parsing response from rdio'));
      }
      cb(err, body);
  });
}

function paged(pi, synclet, perPage, params, cb) {
  var config = pi.config && pi.config[synclet];
  if (!config) config = {paging:{}};
  if (!config.paging) config.paging = {};
  var paging = config.paging;
  var configUpdate = {};
  configUpdate[synclet] = config;

  if (!paging.start) paging.start = 0;

  // For some reason, the Rdio API has a hernia if you tell it to start from 0.
  // It helpfully expresses this as a "401 Invalid Signature" error -- thanks, Ian!
  if (paging.start > 0) params.start = paging.start;
  params.count = perPage;

  api(pi.auth, params, function (err, js) {
    if (err) return cb(err);
    if ('error' === js.status) return cb(js.message);

    var objList = js.result;
    if (!Array.isArray(objList)) return cb(new Error('invalid result from Rdio:' + JSON.stringify(js)));
    if (objList.length < perPage) {
      paging.start = 0;
    } else { // still paging
      paging.start += perPage;
      configUpdate.nextRun = -1;
    }

    return cb(null, configUpdate, objList);
  });
}

exports.getSelf = function (auth, cb) {
  var params = {method : 'currentUser'};

  api(auth, params, function (err, js) {
    if (err) return cb(err);
    if ('error' === js.status) return cb(js.message);
    cb(null, js.result);
  });
};

exports.getFollowing = function (pi, cb) {
  var PAGESIZE = 50;
  var params = {method: 'userFollowing', user: pi.auth.profile.key};

  paged(pi, 'following', PAGESIZE, params, function(err, config, following) {
    if (err) return cb(err);
    cb(null, config, following);
  });
};

exports.getTracksInCollection = function (pi, cb) {
  var PAGESIZE = 1000;

  var params = {method: 'getTracksInCollection', user: pi.auth.profile.key, sort: 'dateAdded'};

  paged(pi, 'collection', PAGESIZE, params, function (err, config, tracks) {
    if (err) return cb(err);
    cb(null, config, tracks);
  });
};

exports.getActivityStream = function (pi, cb) {
  var params = {
    method: 'getActivityStream',
    scope: 'user',
    user: pi.auth.profile.key
  };

  var config = pi.config.activity || {};
  if (!config.last_id) config.last_id = -1;
  if (!config.tmp_synced_through) config.tmp_synced_through = 0;
  if (!config.synced_through) config.synced_through = 0;

  if (config.last_id !== -1) params.last_id = config.last_id;
  api(pi.auth, params, function (err, js) {
    if (err) return cb(err);
    if ('error' === js.status) return cb(js.message);

    var result = js.result;
    var updates = result.updates;

    if (updates && updates.length > 0) {
      var resultsNewestID = new Date(updates[0].date).getTime()/1000;
      if (resultsNewestID > config.tmp_synced_through) {
        config.tmp_synced_through = resultsNewestID;
      }
      var newUpdates = [];
      for (var i in updates) {
        var date = new Date(updates[i].date).getTime()/1000;
        if (date > config.synced_through) newUpdates.push(updates[i]);
      }
      updates = newUpdates;
    }

    var configUpdate = {activity: config};
    if (result.last_id <= config.synced_through) { // done paging
      config.synced_through = config.tmp_synced_through;
      config.last_id = -1;
    } else { // still paging
      config.last_id = result.last_id;
      configUpdate.nextRun = -1;
    }

    cb(null, configUpdate, updates);
  });
};

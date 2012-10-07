var request = require('request');

function api(auth, params, cb) {
  var options = {
    oauth: {
      consumer_key: auth.consumerKey,
      consumer_secret: auth.consumerSecret,
      token: auth.token,
      token_secret: auth.tokenSecret
    },
    form: params,
    json: true,
    url: 'http://api.rdio.com/1/'
  };
  request.post(options, function(err, resp, body) {
    cb(err, body);
  });
};

function paged(pi, synclet, perPage, params, cb) {
  // Using config as a shared namespace requires care -- grab *only* the namespace you
  // need, or race conditions will cause properties to get stomped during simultaneous
  // synclet runs.
  var config = {paging : {}};
  if (pi.config && pi.config.paging && pi.config.paging[synclet]) {
    config.paging[synclet] = pi.config.paging[synclet];
  } else {
    config.paging[synclet] = {}
  }

 if (!config.paging[synclet].start) config.paging[synclet].start = 0;

  // For some reason, the Rdio API has a hernia if you tell it to start from 0.
  // It helpfully expresses this as a "401 Invalid Signature" error -- thanks, Ian!
  if (0 < config.paging[synclet].start) params.start = config.paging[synclet].start;
  params.count = perPage;

  api(pi.auth, params, function (err, js) {
    if (err) return cb(err);
    if ('error' === js.status) return cb(js.message);

    var objList = js.result;
    if (objList.length < perPage) {
      config.paging[synclet].start = 0;
      config.nextRun = 0;
    } else { // still paging
      config.paging[synclet].start += perPage;
      config.nextRun = -1;
    }

    return cb(null, config, objList);
  });
};

exports.getSelf = function (auth, selfHandler, cb) {
  var params = {method : 'currentUser'};

  api(auth, params, function (err, js) {
    if (err) return cb(err);
    if ('error' === js.status) return cb(js.message);

    selfHandler(js.result);
    cb();
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

exports.getTracksInCollection = function (pi, trackHandler, cb) {
  var PAGESIZE = 200; // Make this page larger just because the set is so large.

  var params = {method: 'getTracksInCollection', user: pi.auth.profile.key};

  paged(pi, 'collection', PAGESIZE, params, function (err, config, tracks) {
    if (err) return cb(err);

    for (var i = 0; i < tracks.length; i += 1) trackHandler(tracks[i]);

    cb(null, config);
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

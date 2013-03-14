var request = require('request');
var async = require('async');

var host;
var auth;
var ignoredUsers;

exports.init = function(_host, _auth, _ignoredUsers) {
  host = _host;
  auth = {Authorization:"Basic " + new Buffer(_auth).toString("base64")};
  ignoredUsers = _ignoredUsers;
};

var profilesCache = {};
function setCache(act, profile) {
  profilesCache[act] = JSON.parse(JSON.stringify(profile));
}

function getCache(act) {
  return JSON.parse(JSON.stringify(profilesCache[act]));
}

exports.getProfile = function(act, callback) {
  if (profilesCache[act]) {
    return process.nextTick(callback.bind(null, null, getCache(act)));
  }
  request.get({
    url: host + '/proxy/'+act+'/profile',
    headers: auth,
    json:true},
    function(err, resp, profile) {
      if (!err) setCache(act, profile);
    return callback(err, profile);
  });
}

exports.getAccounts = function(hours, filter, callback) {
  request.get({
    url: host + '/apps/list',
    qs: { since: Date.now() - (hours * 3600000)},
    headers: auth,
    json:true}, function(err, resp, results) {
    if (err) return callback('getHits err' + JSON.stringify(err));
    var apps = [];
    for(var i in results) {
      var act = results[i].notes && results[i].notes.account;
      if(!ignoredUsers || ignoredUsers.indexOf(act) === -1) apps.push(results[i]);
    }
    var byAccount = {};
    async.forEachLimit(apps, 10, function(app, cbAct) {
      var act = app.notes.account;
      exports.getProfile(act, function(err, profile) {
        if (err) callback('failed to proxy for profile' + JSON.stringify(err));
        if (!profile) profile = {};
        app.notes.profile = profile;
        byAccount[app.notes.account] = byAccount[app.notes.account] || app;
        profile = byAccount[app.notes.account].notes.profile;
        profile.apps = profile.apps || [];
        profile.apps.push(app);
        cbAct();
      });
    }, function() {
      var rows = [];
      Object.keys(byAccount).forEach(function(account) {
        var app = byAccount[account];
        if (filter(app)) {
          rows.push({
            id: app.notes.account,
            profile: app.notes.profile
          });
        }
      });
      return callback(null, rows);
    });
  });
}

function getHitsPage(appID, hours, accounts, req, cb) {
  request.get(req, function(err, res, logs) {
    if(err || !Array.isArray(logs)) return cb(err, logs);
    logs.forEach(function(log) {
      if(!Array.isArray(log.data)) return;
      log.data.forEach(function(hit) {
        if(!hit.act || hit.act === 'auth') return;
        if(!accounts[hit.act]) accounts[hit.act] = 0;
        accounts[hit.act]++;
      });
    });
    if (logs.length === 0 ) return cb(null, accounts);
    req.qs.offset += req.qs.limit;
    getHitsPage(appID, hours, accounts, req, cb);
  });
}

exports.getHits = function(appID, hours, callback) {
  getHitsPage(appID, hours, {}, {
      url: host + '/apps/logs',
      qs: {
        key: appID,
        limit:100,
        offset:0,
        since: (Date.now() - (hours * 3600 * 1000))
      },
      headers: auth,
      json: true
    }, callback);
}

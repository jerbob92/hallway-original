var request = require('request');
var url = require('url');
var _ = require('underscore');
_.str = require('underscore.string');

var idr = require('idr');
var ijod = require('ijod');
var lconfig = require('lconfig');
var logger = require('logger').logger('podClient');
var profileManager = require('profileManager');

/* HIGH LEVEL MAP

podClient - use to read/write to any profile data
  has parallel for main ijod functions, .getOne, .getRange, .getTardis, .getBounds, .batchSmartAdd
  these functions must look up the associated profile and find the pod, then do a http serialization of the request/response and return the json just like ijod
  a default "pod" for any non assigned profiles and for account@app or just "app" ids (non-service based profiles)

nexusClient - use to read/write to any app/account information

webservice.js -
  mostly uses entries.runBases
  uses of ijod.* should switch all over to podClient.*
  /id/*
    for bare ids, the _part needs to be compared against the auth'd profiles to determine which pod to talk to for it

authManager.js -
  needs to use podClient to write the self/profile during an auth to make sure it's saved to the pod

entries.js -
  the ijod.getRange/getTardis calls need to use podClient
  .write should just convert to a podClient.batchSmartAdd

push.js -
  needs to use podClient to talk to the account@app style stored data (in the 'nexus'?) to get routes and save backlogs

friends.js -
  can all switch to podClient.*

friendsPump.js -
  needs to use nexusClient to get matching pids for "peers" query
  it's ijod.* calls are all account@app and device based ones (use podClient to talk to that data in the main/nexus?)

*/

function ijodRequest(endpoint, basePath, range, cbEach, cbDone) {
  var pid = idr.pid(basePath);
  if (!_.str.include(pid, '@')) {
    return cbDone(new Error('No PID in base ' + basePath));
  }

  profileManager.loadProfile(pid, function(err, profile) {
    if (err) return cbDone(err);
    if (!profile) return cbDone(new Error('Profile does not exist: ' + pid));
    if (!profile.pod) {
      var ijodFn = 'get' + _.str.capitalize(endpoint);
      if (cbEach) return ijod[ijodFn](basePath, range, cbEach, cbDone);
      else return ijod[ijodFn](basePath, range, cbDone);
    }

    podRequest(podUrl(profile.pod, '/' + endpoint), {
      qs: {
        basePath: basePath,
        range: JSON.stringify(range)
      }
    }, function(err, response, body) {
      if (err) return cbDone(err);
      if (body.error) return cbDone(new Error(body.error));
      if (cbEach && body.data) body.data.forEach(cbEach);
      return cbDone(null, body.result);
    });
  });
}

exports.getRange = function(basePath, range, cbEach, cbDone) {
  return ijodRequest('range', basePath, range, cbEach, cbDone);
};

exports.getTardis = function(basePath, range, cbDone) {
  return ijodRequest('tardis', basePath, range, null, cbDone);
};

exports.getBounds = function(basePath, range, cbDone) {
  return ijodRequest('bounds', basePath, range, null, cbDone);
};

exports.getOne = null; // this needs to be passed in the list of possible pids when it's a "bare" id, and match the _partition bytes against them to find the pod to ask

// in ijod.* used by webservices.js in a few places to write raw data
exports.batchSmartAdd = null; // similar, pull out pid->pod, POST raw entries back to it to write

function podUrl(podID, path) {
  return url.format({
    protocol: (lconfig.podClient.secure ? 'https' : 'http'),
    hostname: ['pod' + podID, lconfig.podClient.domain].join('.'),
    port: lconfig.podService.port,
    pathname: path
  });
}

function podRequest(url, params, callback) {
  params = _.extend({
    auth: lconfig.podService.auth,
    json: true
  }, params);
  return request(url, params, callback);
}

exports.getProfile = function(pod, pid, callback) {
  if (!pod) return callback(new Error('Missing Pod ID'));

  podRequest(podUrl(pod, '/profile'), {
    qs: { pid: pid }
  }, function(err, response, profile) {
    callback(err, profile);
  });
};

exports.createProfile = function(pod, pid, callback) {
  if (!pod) return callback(new Error('Missing Pod ID'));

  podRequest(podUrl(pod, '/profile'), {
    method: 'POST',
    qs: { pid: pid }
  }, function(err, response, profile) {
    callback(err, profile);
  });
};

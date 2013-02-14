var request = require('request');
var url = require('url');
var _ = require('underscore');

var lconfig = require('lconfig');

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

// things from ijod.* as used by entries.js
exports.getRange = null; // use the base, get the pid, lookup the pod, pass the base+options, get the results back and return them
exports.getTardis = null; // same same
exports.getBounds = null; // same same

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

exports.getProfileData = function(pod, pid, callback) {
  if (!pod) return callback(new Error('Missing Pod ID'));

  podRequest(podUrl(pod, '/profile_data'), {
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

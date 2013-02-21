var request = require('request');
var url = require('url');
var _ = require('underscore');
_.str = require('underscore.string');

var idr = require('idr');
var ijod = require('ijod');
var lconfig = require('lconfig');
var logger = require('logger').logger('podClient');
var profileManager = require('profileManager');
var nexusClient = require("nexusClient");

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

// this needs to be passed in the list of possible pids when it's a "bare" id, and match the _partition bytes against them to find the pod to ask
exports.getOne = function(targetIdr, profileHints, cbDone) {
  // Let the profileHints be optional when the idr contains a pid for sure
  if (typeof profileHints === "function") {
    cbDone = profileHints;
    profileHints = [];
  }
  // Some idr types might need to switch to nexus based processing
  //     - routes:*
  //     - map:
  //     - notes saved by dawg?
  //     - index:
  //     - push
  function getPodOne(pid) {
    profileManager.loadProfile(pid, function(err, profile) {
      if (err) return cbDone(err);
      console.log("Should get %s", targetIdr);
      podRequest(podUrl(profile.pod, "/getOne"), {
        "method":"GET",
        "qs": {
          "idr":targetIdr
        }
      }, function(err, res, getOneData) {
        // Convert errors to the expected ijod result style
        if (getOneData["error"] && !err) {
          err = new Error(getOneData["error"]);
          getOneData = null;
        }
        cbDone(err, getOneData);
      });
    })
  }

  var pid = idr.pid(targetIdr);
  if (targetIdr.indexOf(":") > -1 && (pid && pid.indexOf("@") > -1)) {
    // Do the normal processing
    return getPodOne(pid);
  } else if (targetIdr.indexOf("_") > -1) {
    // This is a hashed idr
    // Debugger to help find hashes because they need hinted profiles
    logger.debug("Got a hashed idr to podClient.getOne");
    var E = new Error("hashed idr to podClient.getOne");
    logger.debug(E.stack);

    // Check the hinted profiles and find the match
    profileParts = profileHints.map(function(hintPid) {
      return mmh.murmur128HexSync(hintPid).substr(0,9)
    });
    console.log(profileParts);
    profileIndex = profileParts.indexOf(targetIdr.split("_")[1]);
    console.log("Looking for %s in %j got %d", targetIdr.split("_")[1], profileParts, profileIndex);
    if (profileIndex > -1) {
      return getPodOne(profileHints[profileIndex]);
    }
  }

  console.log("Nexus getOne for %s", targetIdr);
  return nexusClient.getOne(targetIdr, cbDone);
}

exports.getOnePars = null

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
  console.log("Extending with auth %j", lconfig.podService.auth);
  params = _.extend({
    auth: lconfig.podService.auth,
    json: true
  }, params);
  console.log(params);
  return request(url, params, callback);
}

exports.getProfile = function(pod, pid, callback) {
  console.log("Getting profile for %s from %s", pid, pod);
  if (!pod) return callback(new Error('Missing Pod ID'));

  podRequest(podUrl(pod, '/profile'), {
    qs: { pid: pid }
  }, function(err, response, profile) {
    callback(err, profile);
  });
};

exports.createProfile = function(pod, pid, callback) {
  console.log("Creating profile for %s from %s", pid, podUrl(pod, "/profile"));
  if (!pod) return callback(new Error('Missing Pod ID'));

  podRequest(podUrl(pod, '/profile'), {
    method: 'POST',
    qs: { pid: pid }
  }, function(err, response, profile) {
    callback(err, profile);
  });
};

var request = require('request');
var url = require('url');
var path = require('path');
var dMap = require('dMap');
var _ = require('underscore');
_.str = require('underscore.string');

var idr = require('idr');
var ijod = require('ijod');
var lconfig = require('lconfig');
var logger = require('logger').logger('podClient');
var profileManager = require('profileManager');
var nexusClient = require("nexusClient");
var mmh = require('murmurhash3');
var async = require("async");

var role;

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

function getIJODFromNexus(ijodFn, basePath, range, cbEach, cbDone) {
  if(role == "apihost")
  {
    if(cbEach) return ijod[ijodFn](basePath, range, cbEach, cbDone);
    return ijod[ijodFn](basePath, range, cbDone);
  }
  if (cbEach) return nexusClient[ijodFn](basePath, range, cbEach, cbDone);
  return nexusClient[ijodFn](basePath, range, cbDone);
}

function ijodRequest(endpoint, basePath, range, cbEach, cbDone) {
  var ijodFn = 'get' + _.str.capitalize(endpoint);

  var pid = idr.pid(basePath);
  // If there is no pid, the IDR likely reference internal or app data
  if (!_.str.include(pid, '@')) {
    return getIJODFromNexus(ijodFn, basePath, range, cbEach, cbDone);
  }

  var start = Date.now();
  profileManager.loadProfile(pid, function(err, profile) {
    if (err) return cbDone(err);

    // If the profile doesn't exist, the pid is likely a user@app entry
    if (!profile) {
      return getIJODFromNexus(ijodFn, basePath, range, cbEach, cbDone);
    }

    if (!profile.pod && range.app && lconfig.pods.apps && lconfig.pods.apps[range.app])
    {
      profile.pod = lconfig.pods.apps[range.app];
      logger.debug("setting pod for app", profile.pod, pid, range.app);
    }

    if (!profile.pod && range.pod) profile.pod = range.pod;

    if (!profile.pod) {
      if (cbEach) return ijod[ijodFn](basePath, range, cbEach, cbDone);
      else return ijod[ijodFn](basePath, range, cbDone);
    }

    var pstart = Date.now();
    podRequest(podUrl(profile.pod, '/' + endpoint), {
      qs: {
        basePath: basePath,
        range: JSON.stringify(range)
      }
    }, function(err, response, body) {
      if(Date.now() - start > 5000) logger.warn("slow pod request",Date.now() - start, pstart - start, profile.pod, endpoint, basePath, range.app);
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

exports.getPars = function(basePath, options, cbDone) {
  return ijodRequest('pars', basePath, options, null, cbDone);
};

exports.setOneCat = function(id, cat, options, cbDone) {
  //console.log("podClient setOneCat for %s %s", id, cat);
  var pid = idr.pid(id);
  // If there is no pid, the IDR likely reference internal or app data
  if (!_.str.include(pid, '@')) {
    return nexusClient.setOneCat(id, cat, options, cbDone);
  }

  profileManager.loadProfile(pid, function(err, profile) {
    if (err) {
      logger.error(err);
      return cbDone(err);
    }

    // If the profile doesn't exist, the pid is likely a user@app entry
    if (!profile) {
      return nexusClient.setOneCat(id, cat, options, cbDone);
    }

    if (!profile.pod) {
      //console.log("LOCAL setOneCat %s %s", id, cat);
      return ijod.setOneCat(id, cat, options, cbDone);
    }

    podRequest(podUrl(profile.pod, '/setOneCat'), {
      json: {
        id:id,
        cat:cat,
        options:options
      }
    }, function(err, response, body) {
      if (err) {
        logger.error(err);
        return cbDone(err);
      }
      if (body.error) return cbDone(new Error(body.error));
      return cbDone();
    });
  });
};

// this needs to be passed in the list of possible pids when it's a "bare" id, and match the _partition bytes against them to find the pod to ask
exports.getOne = function(targetIdr, profileHints, cbDoneOrig, app, account) {
  // Let the profileHints be optional when the idr contains a pid for sure
  if (typeof profileHints === "function") {
    cbDoneOrig = profileHints;
    profileHints = [];
  }

  // wrap callback to do direct fallback, fetch from the service in-line
  function cbDone(err, entry)
  {
    if(entry && !entry.error) return cbDoneOrig(err, entry);
    if(targetIdr.indexOf('@') == -1) return cbDoneOrig(err, entry);
    var r = idr.parse(targetIdr);
    logger.warn("getOne direct", idr.toString(r), app);
    profileManager.authGetAcct(idr.pid(r), app, account, function (err, auth) {
      if(err || !auth) return cbDoneOrig(err);
      var id;
      try {
        id = require(path.join('services', r.host, 'id.js'));
        id.sync({auth:auth, id:r.hash, type:r.protocol}, function(err, data){
          if(err || !data) return cbDoneOrig(err);
          cbDoneOrig(null, {idr:idr.toString(r), id:idr.hash(r), data:data, at:dMap.get('at', data, r)});
        });
      } catch (E) {
        return cbDoneOrig(E, entry);
      }
    });
  }

  if (!lconfig.pods.enabled) {
    return ijod.getOne(targetIdr, cbDone);
  }
  // Some idr types might need to switch to nexus based processing
  //     - routes:*
  //     - map:
  //     - notes saved by dawg?
  //     - index:
  //     - push
  function getPodOne(pid) {
    //workaround
    if (app === 'b4ac1d88c60fff4223b4997aedcfa063') {
      var r = idr.parse(targetIdr);
      logger.warn("getOne direct", idr.toString(r), app);
      profileManager.authGetAcct(idr.pid(r), app, account, function (err, auth) {
        if(err || !auth) return cbDoneOrig(err);
        var id;
        try {
          id = require(path.join('services', r.host, 'id.js'));
          id.sync({auth:auth, id:r.hash, type:r.protocol}, function(err, data){
            if(err || !data) return cbDoneOrig(err);
            return cbDoneOrig(null, {idr:idr.toString(r), id:idr.hash(r), data:data, at:dMap.get('at', data, r)});
          });
        } catch (E) {
          return cbDoneOrig(E, null);
        }
      });
    }
    //end workaround
    else {
      profileManager.loadProfile(pid, function(err, profile) {
        if (err) return cbDone(err);
        if (!profile || !profile.pod || !lconfig.pods.enabled)
        {
          if(role == "apihost") return ijod.getOne(targetIdr, cbDone);
          return nexusClient.getOne(targetIdr, cbDone);          
        }

        podRequest(podUrl(profile.pod, "/getOne"), {
          "method":"GET",
          "qs": {
            "idr":targetIdr
          }
        }, function(err, res, getOneData) {
          // Convert errors to the expected ijod result style
          if (!err && getOneData.error) {
            err = new Error(getOneData.error);
            getOneData = null;
          }
          cbDone(err, getOneData);
        });
      });
    }
  }

  var pid = idr.pid(targetIdr);
  if (targetIdr.indexOf(":") > -1 && (pid && pid.indexOf("@") > -1)) {
    // Do the normal processing
    return getPodOne(pid);
  } else if (targetIdr.indexOf("_") > -1) {
    // This is a hashed idr
    // Debugger to help find hashes because they need hinted profiles
    /*
    logger.debug("Got a hashed idr to podClient.getOne");
    var E = new Error("hashed idr to podClient.getOne");
    logger.debug(E.stack);
    */

    // Check the hinted profiles and find the match
    var profileParts = profileHints.map(function(hintPid) {
      return mmh.murmur128HexSync(hintPid).substr(0,9);
    });
    var profileIndex = profileParts.indexOf(targetIdr.split("_")[1]);
    if (_.str.include(profileHints[profileIndex], '@devices')) {
      return nexusClient.getOne(targetIdr, cbDone);
    }
    else if (profileIndex > -1) {
      return getPodOne(profileHints[profileIndex]);
    }
  }

  if(role == "apihost") return ijod.getOne(targetIdr, cbDone);
  return nexusClient.getOne(targetIdr, cbDone);
};

exports.getOnePars = function(targetIdr, cat, cbDone) {
  // Check for the profile on the idr and if we have one send it off, otherwise we'll use the nexusClient
  var pid = idr.pid(targetIdr);
  if (!pid) {
    if(role == "apihost") return ijod.getOnePars(targetIdr, cat, cbDone);
    return nexusClient.getOnePars(targetIdr, cat, cbDone);
  } else {
    profileManager.loadProfile(pid, function(err, profile) {
      if (err && !profile.pod) {
        if(role == "apihost") return ijod.getOnePars(targetIdr, cat, cbDone);
        return nexusClient.getOnePars(targetIdr, cat, cbDone);
      }
      podRequest(podUrl(profile.pod, "/getOne"), {
        "method":"GET",
        "qs": {
          "idr":targetIdr,
          "cat":cat
        }
      }, function(err, res, getOneData) {
        if (!err && getOneData.error) {
          err = new Error(getOneData.error);
          getOneData = null;
        }
        return cbDone(err, getOneData);
      });
    });
  }

};

function podUrl(podID, path) {
  return url.format({
    protocol: (lconfig.pods.secure ? 'https' : 'http'),
    hostname: ['lb', 'pod' + podID, lconfig.pods.domain].join('.'),
    port: lconfig.pods.port,
    pathname: path
  });
}

function podRequest(url, params, callback) {
  params = _.extend({
    auth: lconfig.pods.auth,
    json: true
  }, params);
  logger.info("podRequest",url,params);
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

exports.getSynced = function(pod, pid, task, callback) {
  if (!pod) return callback(new Error('Missing Pod ID'));

  podRequest(podUrl(pod, '/synced'), {
    qs: { pid: pid, task: task }
  }, function(err, response, synced) {
    callback(err, synced);
  });
};

exports.createProfile = function(pod, pid, callback) {
  if (!pod) return callback(new Error('Missing Pod ID'));

  //console.log("request to %s", podUrl(pod, "/profile"));
  podRequest(podUrl(pod, '/profile'), {
    method: 'POST',
    qs: { pid: pid }
  }, function(err, response, profile) {
    callback(err, profile);
  });
};

exports.mergeProfileData = function(pod, pid, data, callback) {
  if (!pod) return callback(new Error('Missing Pod ID'));

  podRequest(podUrl(pod, '/profile'), {
    method: 'PUT',
    qs: {
      pid: pid
    },
    json: data
  }, function(err, response, body) {
    callback(err, body);
  });
};

exports.resetProfileConfig = function(pod, pid, callback) {
  if (!pod) return callback(new Error('Missing Pod ID'));

  podRequest(podUrl(pod, '/profile'), {
    method: 'DELETE',
    qs: {
      pid: pid
    }
  }, function(err, response, body) {
    callback(err, body);
  });
};

exports.syncNow = function(pod, pid, timestamp, callback) {
  if (!pod) return callback(new Error('Missing Pod ID'));
  if (!timestamp) return callback(new Error('Missing syncNow timestamp'));

  podRequest(podUrl(pod, '/profile/sync'), {
    method: 'GET',
    qs: {
      pid: pid,
      timestamp: timestamp
    }
  }, function(err, response, body) {
    callback(err);
  });
};

exports.setRole = function(currentRole) {
  role = currentRole;
};

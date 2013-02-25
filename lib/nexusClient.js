/*
* Copyright (C) 2012-2013 Singly, Inc. All Rights Reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:
*    * Redistributions of source code must retain the above copyright
*      notice, this list of conditions and the following disclaimer.
*    * Redistributions in binary form must reproduce the above copyright
*      notice, this list of conditions and the following disclaimer in the
*      documentation and/or other materials provided with the distribution.
*    * Neither the name of the Locker Project nor the
*      names of its contributors may be used to endorse or promote products
*      derived from this software without specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
* ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
* DISCLAIMED. IN NO EVENT SHALL THE LOCKER PROJECT BE LIABLE FOR ANY
* DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
* LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
* ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
* (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
* SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var async       = require('async');
var lconfig     = require('lconfig');
var lutil       = require('lutil');
var request     = require('request');
var logger      = require('logger').logger('nexusClient');
var instruments = require('instruments');

var rclient;


exports.init = function (cbDone) {
  rclient = require('redis').createClient(lconfig.redis.port,
                                          lconfig.redis.host);
  rclient.select(lconfig.nexusClient.database, cbDone);
};

// Retrieve the app info for a given id and cache it as necessary
exports.getApp = function (appId, cbDone) {
  // Prefix the appId ID when we pull it from redis so that it's possible to
  // identify what keys are cached app info in the redis console
  rclient.get("app_" + appId, function (err, result) {
    var appInfo = lutil.safeJsonParse(result);

    // If it's a valid object, we're good to go
    if (appInfo && typeof appInfo === 'object')
      return cbDone(null, appInfo);

    // Contact the nexus and get the latest info
    var params = {
      uri  : lconfig.nexusClient.url + "/app",
      qs   : {"id": appId},
      auth : lconfig.nexusClient.auth,
      json : true
    };
    var startTime = Date.now();
    request.get(params, function (err, response, appInfo) {
      instruments.timing({'nexusClient.getApp': Date.now() - startTime}).send();
      if (err) {
        return cbDone("Failed to get app info for " + appId + " from Nexus: " + err);
      } else if (response.statusCode === 200) {
        if (appInfo && typeof appInfo === 'object') {
          // Update redis cache w/ raw JSON now that we've validated it's
          // well-formed
          rclient.set("app_" + appId, JSON.stringify(appInfo), function (err) {
            if (err) logger.warn("Failed to update redis cache with app info for " + appId + ": " + err);
            return cbDone(null, appInfo);
          });
        } else {
          // We got data back from nexus, but it's not valid JSON
          return cbDone("Failed to parse app info for " + appId + " from Nexus.");
        }
      } else if (response.statusCode === 404) {
        return cbDone("App info for " + appId + " not found on Nexus.");
      } else {
        // Some other unexpected HTTP response code Nexus
        return cbDone("Failed to get app info for " + appId + " from Nexus: " + response.statusCode);
      }
    });
  });
};

// For each app in a list, retrieve the app info and provide it to cbEach; call
// cbDone at the very end.
exports.forEachApp = function (appIds, cbEach, cbDone) {
  // Retrieve the app info for a list of apps in series. Resources are finite! :)
  async.forEachSeries(appIds, function (appId, cbNext) {
    exports.getApp(appId, function (err, appInfo) {
      if (err)
        cbNext(err);
      else
        cbEach(appInfo, cbNext);
    });
  }, cbDone);
};

// For each of the profiles, identify which ones are associated with the app and
// return a map of profileId: accountId
//
// This is used by friends.js pipeline to detect "peers" in an app
exports.matchProfilesWithApp = function (profileIds, appId, cbDone) {
  var params = {uri: lconfig.nexusClient.url + "/matchProfilesWithApp",
                auth: lconfig.nexusClient.auth,
                json: {profiles: profileIds, app: appId}};
  var startTime = Date.now();
  request.post(params, function (err, response) {
    instruments.timing({'nexusClient.matchProfilesWithApp': Date.now() - startTime});
    if (err) {
      return cbDone("Failed to match profiles with app " + appId + ": " + err);
    } else if (response.statusCode === 200) {
      return cbDone(null, response.body);
    } else {
      return cbDone("Failed to match profiles with app " + appId + ": " + err);
    }
  });
  // nexusService needs to do this and return it: "SELECT account, profile from Accounts where app = ? and profile in ("+ ids +")";
};

exports.getOne = function(idr, cbDone) {
  var params = {
    uri: lconfig.nexusClient.url + "/getOne",
    auth: lconfig.nexusClient.auth,
    qs : {
      idr: idr
    },
    json:true
  };
  request.get(params, function(err, res, getOneData) {
    if (err) {
      logger.warn('Error communicating with nexus');
      logger.error(err);
      return cbDone(err);
    }
    // Convert errors to the expected ijod result style
    if (getOneData.error && !err) {
      err = new Error(getOneData.error);
      getOneData = null;
    }
    cbDone(err, getOneData);
  });
};

exports.getOnePars = function(idr, cat, cbDone) {
  var params = {
    uri: lconfig.nexusClient.url + "/getOnePars",
    auth: lconfig.nexusClient.auth,
    qs : {
      idr: idr,
      cat: cat
    },
    json:true
  };
  request.get(params, function(err, res, getOneData) {
    if (err) {
      logger.warn('Error communicating with nexus');
      logger.error(err);
      return cbDone(err);
    }
    // Convert errors to the expected ijod result style
    if (getOneData.error && !err) {
      err = new Error(getOneData.error);
      getOneData = null;
    }
    cbDone(err, getOneData);
  });
};

exports.batchSmartAdd = function(entries, cbDone) {
  var params = {
    uri: lconfig.nexusClient.url + "/batchSmartAdd",
    auth: lconfig.nexusClient.auth,
    json: {
      entries:entries
    }
  };
  request.post(params, function(err, res, body) {
    if (err) {
      logger.warn('Error communicating with nexus');
      logger.error(err);
      return cbDone(err);
    }
    // Convert errors to the expected ijod result style
    if (body.error && !err) {
      err = new Error(body.error);
      body = null;
    }
    cbDone(err, err ? null : body.timings);
  });
};

function ijodRequest(endpoint, basePath, range, cbEach, cbDone) {
  var requestsMade = 0;
  request.get(lconfig.nexusClient.url + '/' + endpoint, {
    auth: lconfig.nexusClient.auth,
    qs: {
      basePath: basePath,
      range: JSON.stringify(range)
    },
    json: true
  }, function(err, response, body) {
    requestsMade++;
    if (requestsMade > 1) {
      logger.warn("WTF", endpoint, basePath);
    }
    if (err) return cbDone(err);
    if (body.error) return cbDone(new Error(body.error));
    if (cbEach && body.data) body.data.forEach(cbEach);
    return cbDone(null, body.result);
  });
}

exports.getBounds = function(basePath, range, cbDone) {
  return ijodRequest('bounds', basePath, range, null, cbDone);
};

exports.getTardis = function(basePath, range, cbDone) {
  return ijodRequest('tardis', basePath, range, null, cbDone);
};

exports.getRange = function(basePath, range, cbEach, cbDone) {
  return ijodRequest('range', basePath, range, cbEach, cbDone);
};

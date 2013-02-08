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

var lconfig = require('lconfig');
var lutil = require('lutil');
var request = require('request');
var logger = require('logger').logger('nexusClient');
var rclient;


exports.init = function (cbDone) {
  rclient = require('redis').createClient(lconfig.redis.port,
                                          lconfig.redis.host);
  rclient.select(lconfig.nexusClient.database, cbDone);
};

exports.getApp = function (app, cbDone) {
  // Prefix the app ID when we pull it from redis so that it's possible to
  // identify what keys are cached app info in the redis console
  rclient.get("app_" + app, function (err, result) {
    var appInfo = lutil.safeJsonParse(result);

    // If it's a valid object, we're good to go
    if (appInfo && typeof appInfo === 'object')
      return cbDone(null, appInfo);

    // Contact the nexus and get the latest info
    var params = {uri: lconfig.nexusClient.url + "/app",
                  qs: {"id": app},
                  auth: lconfig.nexusClient.auth};
    request(params, function (err, response) {
      if (err) {
        return cbDone("Failed to get app info for " + app + " from Nexus: " + err);
      } else if (response.statusCode === 200) {
        appInfo = lutil.safeJsonParse(response.body);
        if (appInfo && typeof appInfo === 'object') {
          // Update redis cache w/ raw JSON now that we've validated it's
          // well-formed
          rclient.put("app_" + app, result, function (err) {
            if (err) logger.warn("Failed to update redis cache with app info for " + app + ": " + err);
            return cbDone(null, appInfo);
          });
        } else {
          // We got data back from nexus, but it's not valid JSON
          return cbDone("Failed to parse app info for " + app + " from Nexus.");
        }
      } else if (response.statusCode === 404) {
        return cbDone("App info for " + app + " not found on Nexus.");
      } else {
        // Some other unexpected HTTP response code Nexus
        return cbDone("Failed to get app info for " + app + " from Nexus: " + response.statusCode);
      }
    });
  });
};

exports.forEachApp = function(apps, cbDone) {
  // Retrieve the app info for a list of apps in series. Resources are finite! :)
  async.forEachSeries(apps, function(app, cbNext) {});
};


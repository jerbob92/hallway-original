var logger  = require('logger').logger('pod');
var express = require('express');

var ijod           = require('ijod');
var lconfig        = require('lconfig');
var middleware     = require('api-host/middleware');
var profileManager = require('profileManager'); // Inited by hallwayd
var ijod = require("ijod");

var pod = express();

function authorize(user, pass) {
  console.log("Checking %s:%s against %j", user, pass, lconfig.podService.auth);
  var auth = lconfig.podService && lconfig.podService.auth;
  if (!auth || !auth.user || !auth.pass) return false;
  return user === auth.user && pass === auth.pass;
}

pod.use(express.basicAuth(authorize));
pod.use(middleware.addErrorFns);

function sendProfile(req, res) {
  logger.info("Sending a profile for %s", req.param("pid"));
  profileManager.allGet(req.param('pid'), function(err, profile) {
    if (err) return res.jsonErr(err);
    return res.json(profile);
  });
}

// Since profiles get autoinstantiated on pods when their first lookup happens,
// GET and POST can do the same thing.
pod.get('/profile', sendProfile);
pod.post('/profile', sendProfile);

function ijodRequest(ijodFn, hasEach, req, res) {
  var response = {};

  var basePath = req.param('basePath');
  var range = req.param('range');
  if (range) {
    try {
      range = JSON.parse(range);
    } catch (E) {
      logger.error(E);
      return res.jsonErr('Error parsing range. ' + E.message);
    }
  }

  function sendResponse(err, result) {
    if (err) response.error = err + ''; // Convert Error to string if needed
    if (result) response.result = result;
    res.json(response, (err ? 500 : 200));
  }

  if (hasEach) {
    response.data = [];

    return ijod[ijodFn](basePath, range, function(item) {
      response.data.push(item);
    }, sendResponse);
  } else {
    return ijod[ijodFn](basePath, range, sendResponse);
  }
}

pod.get('/bounds', function(req, res) {
  return ijodRequest('getBounds', false, req, res);
});

pod.get('/range', function(req, res) {
  return ijodRequest('getRange', true, req, res);
});

pod.get('/tardis', function(req, res) {
  return ijodRequest('getTardis', false, req, res);
});

// ijod getOne support
pod.get("/getOne", function(req, res) {
  if (!req.param("idr")) return res.end("idr parameter not specified", 400);
  ijod.getOne(req.param("idr"), function(err, data) {
    if (err) return res.jsonErr(err);
    return res.json(data);
  });
});

exports.startService = function(port, ip, callback) {
  pod.listen(port, ip, function() {
    logger.info(
      'Pod at ' + ip + ':' + port,
      'putting itself to the fullest possible use,',
      'which is all I think that any conscious entity can ever hope to do.');
    callback();
  });
};

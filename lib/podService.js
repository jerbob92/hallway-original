var logger  = require('logger').logger('pod');
var express = require('express');

var ijod           = require('ijod');
var lconfig        = require('lconfig');
var middleware     = require('api-host/middleware');
var profileManager = require('profileManager'); // Inited by hallwayd

var pod = express();

function authorize(user, pass) {
  var auth = lconfig.podService && lconfig.podService.auth;
  if (!auth || !auth.user || !auth.pass) return false;
  return user === auth.user && pass === auth.pass;
}

pod.use(express.basicAuth(authorize));
pod.use(middleware.addErrorFns);

function sendProfile(req, res) {
  profileManager.allGet(req.param('pid'), function(err, profile) {
    if (err) return res.jsonErr(err);
    return res.json(profile);
  });
}

// Since profiles get autoinstantiated on pods when their first lookup happens,
// GET and POST can do the same thing.
pod.get('/profile', sendProfile);
pod.post('/profile', sendProfile);

pod.get('/range', function(req, res) {
  var result = {
    data: []
  };

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

  ijod.getRange(basePath, range, function(item) {
    result.data.push(item);
  }, function(err) {
    if (err) result.error = err + ''; // Convert Error to string if needed
    res.json(result, (err ? 500 : 200));
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

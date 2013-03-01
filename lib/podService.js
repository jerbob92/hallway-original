var logger  = require('logger').logger('pod');
var express = require('express');

var ijod           = require('ijod');
var ijodEndpoints  = require('ijod-endpoints');
var lconfig        = require('lconfig');
var middleware     = require('api-host/middleware');
var profileManager = require('profileManager'); // Inited by hallwayd

var pod = express();

function authorize(user, pass) {
  console.log("Checking %s:%s against %j", user, pass, lconfig.pods.auth);
  var auth = lconfig.pods && lconfig.pods.auth;
  if (!auth || !auth.user || !auth.pass) return false;
  return user === auth.user && pass === auth.pass;
}

pod.use(express.basicAuth(authorize));
pod.use(middleware.addErrorFns);
pod.use(express.bodyParser());

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

pod.put('/profile', function(req, res) {
  logger.debug(req);
  var pid = req.param('pid');
  var auth = req.param('auth');
  var config = req.param('config');
  logger.debug('Merging into', pid, auth, config);
  profileManager.allSet(pid, auth, config, function(err) {
      if (err) return res.jsonErr(err);
      return res.json(true);
    }
  );
});

ijodEndpoints.addRoutes(pod);

exports.startService = function(port, ip, callback) {
  pod.listen(port, ip, function() {
    logger.info(
      'Pod at ' + ip + ':' + port,
      'putting itself to the fullest possible use,',
      'which is all I think that any conscious entity can ever hope to do.');
    callback();
  });
};

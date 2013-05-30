var logger  = require('logger').logger('pod');
var express = require('express');

var ijod           = require('ijod');
var ijodEndpoints  = require('ijod-endpoints');
var lconfig        = require('lconfig');
var middleware     = require('api-host/middleware');
var profileManager = require('profileManager'); // Inited by hallwayd
var taskmanNG      = require('taskman-ng');
var taskList = require('taskList');

var pod = express();

var debug = lconfig.debug;

function authorize(user, pass) {
  var auth = lconfig.pods && lconfig.pods.auth;
  if (!auth || !auth.user || !auth.pass) return false;
  return user === auth.user && pass === auth.pass;
}

if (debug) {
  pod.use(function(req, res, next) {
    //console.log("REQ: %s", req.url);
    return next();
  });
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
  var pid = req.param('pid');
  var auth = req.param('auth');
  var config = req.param('config');
  profileManager.allSet(pid, auth, config, function(err) {
      if (err) return res.jsonErr(err);
      return res.json(true);
    }
  );
});

pod.del('/profile', function(req, res) {
  profileManager.reset(req.param('pid'), function(err) {
    if (err) return res.jsonErr(err);
    return res.json(true);
  });
});

pod.get('/profile/sync', function(req, res) {
  taskmanNG.syncNow(req.param('pid'), req.param('timestamp'), function(err) {
    if (err) return res.jsonErr(err);
    return res.json(true);
  });
});

pod.get('/synced', function(req, res) {
  var pid = req.param('pid');
  var task = req.param('task')
  taskList.load(pid, function (err, tlist) {
    if (err) {
      logger.error("Unable to load tasklist for " + pid + ": " + err);
      return res.jsonErr("Unable to load tasklist for " + pid, 500);
    }

    if (!tlist.tasks[task] ||
        !tlist.tasks[task].tdone ||
        tlist.tasks[task].tdone <= 1) {
      // Either we haven't synced this endpoint or tdone is not yet set;
      // we haven't yet completed any syncing
      return res.json(false);
    } else {
      // The serviceEndpoint and tdone are both present; we've synced at least
      // once
      return res.json(true);
    }
  });
});

ijodEndpoints.addRoutes(pod);

exports.startService = function(port, ip, callback) {
  pod.listen(port, ip, function() {
    logger.vital(
      'Pod at ' + ip + ':' + port,
      'putting itself to the fullest possible use,',
      'which is all I think that any conscious entity can ever hope to do.');
    callback();
  });
};

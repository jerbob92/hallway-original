var logger  = require('logger').logger('nexus');
var express = require('express');

var acl           = require('acl'); // Inited by hallwayd
var ijod          = require('ijod');
var ijodEndpoints = require('ijod-endpoints');
var lconfig       = require('lconfig');
var middleware    = require('api-host/middleware');

var nexus = express();

var debug = lconfig.debug;

function authorize(user, pass) {
  var auth = lconfig.nexus && lconfig.nexus.auth;
  if (!auth || !auth.user || !auth.pass) return false;
  return user === auth.user && pass === auth.pass;
}

if (debug) {
  nexus.use(function(req, res, next) {
    //console.log("REQ %s", req.url);
    return next();
  });
}
nexus.use(express.basicAuth(authorize));
nexus.use(middleware.addErrorFns);
nexus.use(express.bodyParser());

ijodEndpoints.addRoutes(nexus);

nexus.get('/app', function(req, res) {
  var id = req.param('id');
  acl.getApp(id, function(err, app) {
    if (err)  return res.jsonErr(err);
    if (!app) return res.jsonErr('No app: ' + id, 404);
    return res.json(app);
  });
});

nexus.post("/batchSmartAdd", function(req, res) {
  var entries = req.body && req.body.entries;
  if (!entries) {
    logger.error("No entries supplied");
    return res.jsonErr("Entries not supplied", 400);
  }
  ijod.batchSmartAdd(entries, function(err, timings) {
    if (err) return res.jsonErr(err);
    return res.json({timings:timings});
  });

});

nexus.post('/accounts', function(req, res) {
  var app = req.param('app');
  var pids = req.param('pids');
  if (!app) return res.jsonErr('Missing parameter: app', 400);
  if (!pids || pids.length === 0) {
    return res.jsonErr('Missing parameter: pids', 400);
  }
  acl.getAppProfiles(app, pids, function(err, accounts) {
    if (err) return res.jsonErr(err);
    return res.json(accounts);
  });
});

exports.startService = function(port, ip, callback) {
  nexus.listen(port, ip, function() {
    logger.vital(
      'Nexus online (' + ip + ':' + port + ').',
      'Would you...like to be upgraded?');
    callback();
  });
};

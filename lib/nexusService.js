var logger  = require('logger').logger('nexus');
var express = require('express');

var acl           = require('acl'); // Inited by hallwayd
var ijod          = require('ijod');
var ijodEndpoints = require('ijod-endpoints');
var lconfig       = require('lconfig');
var middleware    = require('api-host/middleware');

var nexus = express();

function authorize(user, pass) {
  var auth = lconfig.nexus && lconfig.nexus.auth;
  if (!auth || !auth.user || !auth.pass) return false;
  return user === auth.user && pass === auth.pass;
}

nexus.use(express.basicAuth(authorize));
nexus.use(middleware.addErrorFns);

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
  var entries = req.param("entries");
  if (!entries) return res.jsonErr("Entries not supplied", 400);
  ijod.batchSmartAdd(entries, function(err, timings) {
    if (err) return res.jsonErr(err);
    return res.json({timings:timings});
  });

});

exports.startService = function(port, ip, callback) {
  nexus.listen(port, ip, function() {
    logger.info(
      'Nexus online (' + ip + ':' + port + ').',
      'Would you...like to be upgraded?');
    callback();
  });
};

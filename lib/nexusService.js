var logger  = require('logger').logger('nexus');
var express = require('express');

var acl        = require('acl'); // Inited by hallwayd
var lconfig    = require('lconfig');
var middleware = require('api-host/middleware');
var ijod = require("ijod");

var nexus = express();

function authorize(user, pass) {
  var auth = lconfig.nexusService && lconfig.nexusService.auth;
  if (!auth || !auth.user || !auth.pass) return false;
  return user === auth.user && pass === auth.pass;
}

nexus.use(express.basicAuth(authorize));
nexus.use(middleware.addErrorFns);

nexus.get('/app', function(req, res) {
  var id = req.param('id');
  acl.getApp(id, function(err, app) {
    if (err)  return res.jsonErr(err);
    if (!app) return res.jsonErr('No app: ' + id, 404);
    return res.json(app);
  });
});

nexus.get("/getOne", function(req, res) {
  if (!req.param("idr")) return res.end("idr parameter not specified", 400);
  ijod.getOne(req.param("idr"), function(err, data) {
    if (err) return res.jsonErr(err);
    return res.json(data);
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

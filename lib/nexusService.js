var logger = require('logger').logger('nexus');
var express = require('express');

var lconfig = require('lconfig');

var nexus = express();

function authorize(user, pass) {
  var auth = lconfig.nexusService && lconfig.nexusService.auth;
  if (!auth || !auth.user || !auth.pass) return false;
  return user === auth.user && pass === auth.pass;
}

nexus.use(express.basicAuth(authorize));

nexus.get('/', function(req, res) {
  res.send('Hello');
});

exports.startService = function(port, ip, callback) {
  nexus.listen(port, ip, function() {
    logger.info(
      'Nexus online (' + ip + ':' + port + ').',
      'Would you...like to be upgraded?');
    callback();
  });
};

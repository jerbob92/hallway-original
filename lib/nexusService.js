var logger = require('logger').logger('nexus');
var express = require('express');

var nexus = express();

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

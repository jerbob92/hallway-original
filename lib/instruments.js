var lconfig = require("lconfig");
var logger = require('logger').logger('instruments');
var stats = require("statsd-singly");

var host;
var port;

if (lconfig.statsd) {
  host = lconfig.statsd.host;
  port = lconfig.statsd.port;
}

var client = new stats.StatsD(host, port, function (err) {
  if (err) logger.warn('Error:', err);
});

client.init();

module.exports = client;

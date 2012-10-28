var path = require('path');
var fs = require('fs');

var async = require('async');

var logger = require('logger').logger('servezas');

var SERVICES = {};
var SYNCLETS = {};

// just breaking out to be cleaner, load up any synclets.json
exports.load = function(callback) {
  var services = fs.readdirSync(path.join(__dirname,'services'));
  async.forEach(services, function(service, cbLoop) {
    var map = path.join(__dirname,'services',service,'synclets.json');
    fs.exists(map, function(exists) {
      if (!exists) return cbLoop();
      logger.debug("loading",map);
      var sjs = SERVICES[service] = JSON.parse(fs.readFileSync(map));
      if (!SYNCLETS[service]) SYNCLETS[service] = {};

      for (var i = 0; i < sjs.synclets.length; i++) {
        var sname = sjs.synclets[i].name;
        var spath = path.join(__dirname, "services", service, sname);
        delete require.cache[spath]; // remove any old one
        SYNCLETS[service][sname] = {
          data: sjs.synclets[i],
          sync: require(spath).sync
        };
        logger.debug("\t* " + sname);
      }

      cbLoop();
    });
  }, callback);
};

exports.syncletList = function(service) {
  return Object.keys(SYNCLETS[service]);
}

exports.syncletData = function(service, synclet) {
  return SYNCLETS[service][synclet].data;
}

exports.synclet = function(service, synclet) {
  return SYNCLETS[service][synclet];
}

exports.synclets = function(service) { return SYNCLETS[service]; }

exports.services = function() { return SERVICES; }

exports.serviceList = function() { return Object.keys(SERVICES); }

exports.isSandboxed = function(service) { return SERVICES[service].sandbox; }

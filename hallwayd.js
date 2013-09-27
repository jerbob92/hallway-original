/*
 *
 * Copyright (C) 2011, Singly, Inc.
 * All rights reserved.
 *
 * Please see the LICENSE file for more information.
 *
 */

exports.alive = false;

var async = require('async');
var argv = require('optimist').argv;

// lconfig has to be loaded before any other hallway modules!
var lconfig = require('lconfig');

var instruments = require('instruments');
var logger = require('logger').logger('hallwayd');

logger.vital('hallwayd process id:', process.pid);

// temp measure to help apihosts have bigger pool
if (argv._.length === 0 || argv._[0] === "apihost") {
  if(lconfig.database && lconfig.database.maxConnections) lconfig.database.maxConnections *= 2;
}

// avoid DEPTH_ZERO_SELF_SIGNED_CERT
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
var http = require('http');
var https = require('https');

var dnsCache = require("dns-cache");
var dns = require("dns");
dns.lookup = dnsCache.cachedLookup;
// Reap the dns cache every 5m to refresh and prevent ram waste
setInterval(function() {
  logger.info("Reaping dns cache.");
  dnsCache.clearCache();
}, lconfig.dnsReapTime);

// Set our globalAgent sockets higher
http.globalAgent.maxSockets = 2048;
https.globalAgent.maxSockets = 2048;

function startAPIHost(cbDone) {
  logger.vital("Starting an API hostess");

  var webservice = require('webservice');

  webservice.startService(lconfig.lockerPort, lconfig.lockerListenIP,
    function () {
    logger.vital('Hallway is now listening at ' + lconfig.lockerListenIP +
      ':' + lconfig.lockerPort);

    cbDone();
  });
}

function startDawg(cbDone) {
  if (!lconfig.dawg || !lconfig.dawg.port || !lconfig.dawg.password) {
    logger.error("You must specify a dawg section with at least a port and " +
      "password to run.");

    process.exit(1);
  }

  logger.vital("Starting a Hallway Dawg -- Think you can get away without " +
    "having a hall pass?  Think again.");

  var dawg = require('dawg');

  dawg.startService(lconfig.dawg.port, lconfig.dawg.listenIP, function () {
    logger.vital("The Dawg is now monitoring at port %d", lconfig.dawg.port);

    cbDone();
  });
}

function startNexus(cbDone) {
  logger.vital('Starting a Nexus. Should last about 4 years.');
  require('nexusService').startService(
    lconfig.nexus.port,
    lconfig.nexus.listenIP,
    cbDone
  );
}

function startStream(cbDone) {
  logger.vital("Starting a Hallway Stream -- you're in for a good time.");

  require('streamer').startService(lconfig.stream, function () {
    logger.vital("Streaming at port %d", lconfig.stream.port);

    cbDone();
  });
}

var Roles = {
  apihost: {
    startup: startAPIHost
  },
  dawg: {
    startup: startDawg
  },
  nexus: {
    startup: startNexus
  },
  stream: {
    startup: startStream
  }
};

var rolename = 'apihost';
var role = Roles[rolename];

if (argv._.length > 0) {
  rolename = argv._[0];

  if (!Roles.hasOwnProperty(rolename)) {
    logger.error("The %s role is unknown.", rolename);
    process.exit(1);
  }

  role = Roles[rolename];
}

var startupTasks = [];

var podClient = require("podClient");
podClient.setRole(rolename);

if (role !== Roles.stream) {
  // this loads all lib/services/*/map.js
  startupTasks.push(function (cb) {
    require('dMap').load();
    require('servezas').load();

    cb();
  });
  startupTasks.push(require('ijod').initDB);
  startupTasks.push(require('tokenz').init);
  startupTasks.push(require('nexusClient').init);

  var profileManager = require('profileManager');
  startupTasks.push(profileManager.init);
  profileManager.setRole(rolename);
}

if (role !== Roles.dawg && role !== Roles.stream) {
  var acl = require('acl');
  startupTasks.push(acl.init);
  acl.setRole(rolename);
}

if (role.startup) {
  startupTasks.push(role.startup);
}

async.series(startupTasks, function (err) {
  if (err) {
    logger.error('Error during startup', err);

    process.exit(1);
  }

  logger.vital("Hallway is up and running.");

  exports.alive = true;
});

process.on("SIGINT", function () {
  logger.vital("Shutting down via SIGINT...");

  switch (role) {
  case Roles.apihost:
    process.exit(0);
    break;
  default:
    process.exit(0);
    break;
  }
});

process.on("SIGTERM", function () {
  logger.vital("Shutting down via SIGTERM...");
  process.exit(0);
});

process.on('uncaughtException', function (err) {
  logger.warn('Uncaught exception:', err.stack);

  instruments.increment('exceptions.uncaught').send();

  // We try to ignore "innocous" errors. This is a temporary fix until we can
  // track down source.  TODO: Track down any/all root causes so we can get rid
  // of this hack
  // Check for errors we are comfortable (!!) ignoring
  var ignoredErrors = [
    // see: https://github.com/joyent/node/issues/2997
    "Error: Parse Error",
    "ECONNRESET",
    "socket hangup",
    "ETIMEDOUT",
    "EADDRINFO"
  ];

  var errString = err.toString();

  for (var msg in ignoredErrors) {
    if (errString.indexOf(ignoredErrors[msg]) >= 0) {
      logger.warn("Ignored exception: ", ignoredErrors[msg]);
      instruments.increment('exceptions.ignored').send();
      return;
    }
  }

  // None of the errors we know about -- shutdown
  process.exit(1);
});

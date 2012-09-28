if (process.argv.length != 4) {
  console.error("testSynclet.js <profile@toRun> <synclet>");
  process.exit(1);
}

var lconfig = require("lconfig");

lconfig.load("Config/config.json");

var dal = require("dal");
var fs = require("fs");
var idr = require("idr");
var logger = require("logger").logger("testSynclet");
var profileManager = require("profileManager");
var path = require("path");
var ijod = require("ijod");

var profile = process.argv[2];
var synclet = process.argv[3];

var service = profile.split("@")[1];


logger.info("Running %s/%s for %s", service, synclet, profile);

function exitWithError() {
  logger.error.apply(logger, arguments);
  process.exit(1);
}

function runService() {
  dal.query("SELECT service FROM Profiles WHERE id=?", [profile], function(error, rows) {
    if (error) exitWithError("Error finding the profile %s: %s", profile, error);
    if (rows.length != 1 || rows[0].service != service) exitWithError("Did not find a valid profile for %s", service);

    profileManager.allGet(profile, function(error, pi) {
      if (error) exitWithError("Error getting the profile information for %s: %s", profile, error);
      if (!pi.auth) exitWithError("No auth information was found for the profile %s, you must auth before you can run the synclet.", profile);

      //logger.debug("%j", pi);
      try {
        var mod = require(path.join(__dirname, "lib", "services", service, synclet) + ".js");
        if (!mod) exitWithError("Could not find the synclet for %s/%s", service, synclet);
        mod.sync(pi, function(error, data) {
          if (error) exitWithError("%s/%s returned the error: %s", service, synclet, error);
          logger.info("%s/%s returned: %j", service, synclet, data);
          process.exit(0);
        });
      } catch(E) {
        exitWithError("Got an exception running %s/%s: %s", service, synclet, E);
      }
    });
  });
}

ijod.initDB(function(error) {
  runService();
});

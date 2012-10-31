var lconfig = require("../lib/lconfig");

var dal = require("dal");
dal.debug = false;

var async = require("async");

// First we find any apps that have more than 25 users
dal.query("SELECT COUNT(*) AS userCount, app.app, app.notes, app.apikeys FROM Accounts AS ac LEFT JOIN Apps AS app ON ac.app = app.app GROUP BY ac.app", [], function(error, rows) {
  if (error) {
    console.error("Error getting user counts: %s", error);
    return;
  }
  async.forEachSeries(rows, function(row, cbStep) {
    if (row.app == "singly-dev-registration") return process.nextTick(cbStep);
    try {
      var notes = JSON.parse(row.notes);
    } catch(E) {
    }
    if (!notes) {
      notes = {appName:"unknown"};
    }
    if (row.userCount < 25) return process.nextTick(cbStep);
    if (row.apiKeys === null) {
      console.error("App %s (%s) has no apiKeys set and %d users.", notes.appName, row.app, row.userCount);
      return process.nextTick(cbStep);
    }
    try { var apiKeys = JSON.parse(row.apikeys); } catch(E) {};
    if (!apiKeys) apiKeys = {};
    // For each of these apps we get what services they are using in their profile set
    dal.query("SELECT DISTINCT service FROM Profiles AS p LEFT JOIN Accounts AS a ON a.profile = p.id WHERE a.app = ?", [row.app], function(error, serviceRows) {
      if (error) {
        console.error("Error getting services: %s", error);
        return cbStep();
      }
      serviceRows.forEach(function(service) {
        if (!apiKeys[service.service]) {
          console.error("App %s (%s) has no key for %s and %d users.", notes.appName, row.app, service.service, row.userCount);
        }
      });
      return cbStep();
    });
  }, function(E) {
    process.exit(0);
  });
});

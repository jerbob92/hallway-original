if (process.argv.length !== 4) {
  console.error('testSynclet.js <profile@service> <synclet>');

  process.exit(1);
}

var path = require('path');

var async = require('async');
var dal = require('dal');
var logger = require('logger').logger('testSynclet');
var profileManager = require('profileManager');
var ijod = require('ijod');

var profile = process.argv[2];
var synclet = process.argv[3];

var service = profile.split('@')[1];

logger.info('Running %s/%s for %s', service, synclet, profile);

function exitWithError() {
  logger.info.apply(logger, arguments);

  process.exit(1);
}

var runs = 0;

function runService(paginationPi, cb) {
  dal.query('SELECT service FROM Profiles WHERE id=?', [profile],
    function (error, rows) {
    if (error) {
      exitWithError('Error finding the profile %s: %s', profile, error);
    }

    if (rows.length !== 1 || rows[0].service !== service) {
      exitWithError('Did not find a valid profile for %s', service);
    }

    profileManager.allGet(profile, function (error, pi) {
      if (error) {
        exitWithError('Error getting profile information for %s: %s',
          profile, error);
      }

      if (!pi.auth) {
        exitWithError('No auth information was found for the profile %s,' +
          ' you must auth before you can run the synclet.', profile);
      }

      // TODO: Refactor this hack
      if (paginationPi) {
        pi = paginationPi;
        pi.config.nextRun = 0;
      }

      try {
        var mod = require(path.join(__dirname, '/../lib', 'services', service,
          synclet) + '.js');

        if (!mod) {
          exitWithError('Could not find the synclet for %s/%s', service,
            synclet);
        }

        mod.sync(pi, function (error, data) {
          if (error) {
            exitWithError('%s/%s returned error: %s', service, synclet, error);
          }

          // TODO: Check for verbose flag
          var returned = Object.keys(data.data);

          returned = returned.map(function (key) {
            var result = {};

            if (Array.isArray(data.data[key])) {
              result[key] = data.data[key].length;
            } else {
              result[key] = data.data[key];
            }

            return result;
          });

          logger.info('%d %s/%s returned: %s', runs, service, synclet,
            JSON.stringify(returned));

          cb(data);
        });
      } catch (e) {
        exitWithError('Exception running %s/%s: %s', service, synclet, e);
      }
    });
  });
}

ijod.initDB(function () {
  var queue = [null];

  async.whilst(function () {
    return queue.length > 0;
  }, function (whilstCb) {
    runs++;

    runService(queue.pop(), function (data) {
      if (data.config.nextRun === -1) {
        queue.push(data);
      }

      whilstCb();
    });
  }, function () {
    process.exit(0);
  });
});

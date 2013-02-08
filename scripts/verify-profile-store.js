var async = require('async');

var logger = require('logger').logger('verify-profile-store');
var profileManager = require('profileManager');
var dal = require('dal');

var total   = 0;
var present = 0;
var missing = 0;
var errors  = 0;
var empty   = 0;

function checkProfile(pid, callback) {
  if (/^\s*$/.test(pid)) {
    empty++;
    return callback();
  }

  logger.debug('Testing', pid);
  profileManager.genGetNoFallback(pid, function(err, profile) {
    if (err) {
      logger.warn('Error', pid);
      logger.error(err);
      errors++;
    } else if (!profile) {
      logger.warn('Missing', pid);
      missing++;
    } else {
      present++;
    }
    return callback();
  });
}

function printResults(err) {
  if (err) logger.error(err);
  logger.info('Done');
  logger.info('Total:',    total);
  logger.info('Present:',  present);
  logger.info('Missing:',  missing);
  logger.info('Errors:',   errors);
  logger.info('Empty:',    empty);
  process.exit(0);
}

function noop() {}

profileManager.init(function() {
  dal.query('SELECT id FROM Profiles limit 10', [], function(err, rows) {
    var pids = rows.map(function(row) {
      return row.id;
    });

    total = pids.length;
    logger.info('Testing', total, 'profiles');
    logger.debug(pids);

    var queue = async.queue(checkProfile, 10);
    queue.drain = printResults;
    pids.forEach(function(pid) {
      queue.push(pid, noop);
    });
  });
});

var logger = require('logger').logger('reset-profile-config');
var profileManager = require('profileManager');

var pid = process.argv[2];

profileManager.init(function() {
  logger.info('Resetting', pid);
  profileManager.reset(pid, function(err) {
    console.log('Done');
    process.exit(0);
  });
});

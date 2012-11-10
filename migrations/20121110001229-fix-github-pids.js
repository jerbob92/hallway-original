var fs = require('fs');
var async = require('async');
var dbm = require('db-migrate');
var type = dbm.dataType;

var get = 'SELECT id, auth FROM Profiles WHERE service="github"';
exports.up = function(db, callback) {
  db.runSql(get, function(err, profiles) {
    if (err) return callback(err);
    console.log('migrating ' + profiles.length + ' profiles');
    async.forEachSeries(profiles, function(profile, cbLoop) {
      backupRow(profile, function(err) {
        if (err) return cbLoop('err backing up row:' + JSON.stringify(err));
        updateProfile(db, profile, cbLoop);
      });
    }, callback);
  });

};

exports.down = function(db, callback) {
  throw new Error('one way street, sucka');
};

function updateProfile(db, profile, callback) {
  var pid = profile.id;
  var auth = profile.auth;
  try {
    auth = JSON.parse(auth);
  } catch(e) {
    return process.nextTick(callback.bind(null, 'failed to parse auth'));
  }
  if (!auth) return process.nextTick(callback);
  auth.pid = pid;
  auth = JSON.stringify(auth);
  var sql = 'UPDATE Profiles SET auth=? WHERE id=? LIMIT 1';
  db.runSql(sql, [auth, pid], callback);
}

function backupRow(row, callback) {
  fs.appendFile('apps_rows_backup.txt', JSON.stringify(row)+'\n', callback);
}

var fs = require('fs');

var async = require('async');
var dbm = require('db-migrate');
var type = dbm.dataType;

var get = 'SELECT * FROM Profiles WHERE service="instagram" AND ' +
          'INSTR(auth, \'undefined@instagram\') > 0';

exports.up = function(db, callback) {
  // gets all the rows with "long" (gt 60k) auth fields
  db.runSql(get, function(err, rows) {
    console.log(rows);
    // loop over them
    async.forEachSeries(rows, function(row, cbEach) {
      backupRow(row, function(err) {
        if (err) return cbEach('couldn\'t backup row! '+JSON.stringify(err));
        var auth = row.auth;
        if (!auth) return cbEach('no auth object for row:' + row.id);
        try {
          auth = JSON.parse(auth);
        } catch (e) {
          return cbEach('couldn\'t parse auth object, row:', + row.id);
        }
        if (!(auth.token && auth.token.user && auth.token.user.id)) {
          return cbEach('invalid auth object for row:' + row.id);
        }
        var real_pid = auth.token.user.id+'@instagram';
        if(real_pid === 'undefined@instagram') {
          return cbEach('real_pid === undefined@instagram, row:' + row.id);
        }
        if (real_pid !== row.id) {
          return cbEach('real_pid !== row.id, row:' + row.id);
        }
        auth.pid = real_pid;
        saveNewAuth(db, row.id, auth, cbEach);
      });
    }, callback);
  });
};

exports.down = function(db, callback) {
  // one way street sucka
};

var saveSql = 'UPDATE Profiles SET auth=?, config=\'{}\'' +
              'WHERE service="instagram" AND id=? LIMIT 1';
function saveNewAuth(db, pid, auth, callback) {
  // ensure there is a pid and it is for a github profile
  if (!(pid && pid.indexOf('@instagram') > 0)) {
    return process.nextTick(function() {
      callback('invalid pid: ' + pid);
    })
  }
  // just double check that auth is an object and it has a pid
  if (!(auth && typeof auth === 'object' && auth.pid === pid)) {
    return process.nextTick(callback.bind(this, 'invalid auth'));
  }
  var auth = JSON.stringify(auth);

  // save it back out
  db.runSql(saveSql, [auth, pid], callback);
}

function backupRow(row, callback) {
  fs.appendFile('rows_backup.txt', JSON.stringify(row)+'\n', callback);
}

var async = require('async');
var dbm = require('db-migrate');
var type = dbm.dataType;

var l = 60000;
var get = 'SELECT * FROM Profiles WHERE service="github" AND LENGTH(auth) > '+l;

exports.up = function(db, callback) {
  db.runSql(get, function(err, rows) {
    console.log(rows);
    async.forEachSeries(rows, function(row, cbEach) {
      console.error('row', row);
      var auth = row.auth;
      var pid = row.id;
      var newAuth = fix(auth);
      if (typeof newAuth === 'string') {
        console.error('fail to fix auth for', pid,':', newAuth);
        cbEach(newAuth);
      } else {
        console.log('saving auth for', pid, newAuth);
        saveNewAuth(db, pid, newAuth, cbEach);
      }
    }, callback);
  });
};

var saveSql = 'UPDATE Profiles SET auth=? WHERE id=?';
function saveNewAuth(db, pid, auth, callback) {
  if (!(pid && pid.indexOf('@github') > 0)) {
    return process.nextTick(function() {
      callback('invalid pid: ' + pid);
    })
  }
  if (!(auth && typeof auth === 'object' && auth.pid === pid)) {
    return process.nextTick(callback.bind(this, 'invalid auth'));
  }
  var auth = JSON.stringify(auth);
  db.runSql(saveSql, [auth, pid], callback);
}

exports.down = function(db, callback) {
  // one way street, no going back dude
};

var requireFields = [
  'accessToken',
  'token',
  'clientID',
  'clientSecret',
  'pid',
  'profile',
  'accounts',
  'apps'
];

function fix(auth) {
  if (!auth || typeof auth !== 'string') return 'invalid auth';
  //auth = auth.substring(0, 2000);
  var eventsStart = auth.indexOf('}},"events":[');
  if (eventsStart === -1) eventsStart = auth.indexOf('}},"userEvents":[');
  if (eventsStart === -1) {
    return 'couldn\'t find "events"';
  }
  auth = auth.substring(0, eventsStart + 2) + '}';
  try {
    auth = JSON.parse(auth);
  } catch(e) {
    return 'couldn\'t parse the substring: ' + auth;
  }
  var missing = missingFields(auth, requireFields);
  if (missing) return missing;
  return auth;
}

function missingFields(auth, fields) {
  for (var i in fields) {
    var f = fields[i];
    if (!auth[f]) return 'no ' + f;
  }
}


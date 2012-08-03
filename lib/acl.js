var lconfig = require("lconfig");
var dal = require('dal');
var logger = require('logger').logger('acl');
var crypto = require('crypto');

exports.init = function(callback) {
  logger.debug("acl init");
  var creates = [
    "CREATE TABLE IF NOT EXISTS Accounts (id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, account VARCHAR(255), app VARCHAR(255), profile VARCHAR(255), `cat` TIMESTAMP  NULL  DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS Apps (`app` VARCHAR(255) PRIMARY KEY, secret VARCHAR(255), apikeys TEXT, notes TEXT, `cat` TIMESTAMP  NULL  DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS Grants (`code` VARCHAR(255) PRIMARY KEY, account VARCHAR(255), app VARCHAR(255), `cat` TIMESTAMP  NULL  DEFAULT CURRENT_TIMESTAMP)"
  ];
  dal.bQuery(creates, function(err){
    if(err) logger.error("accounts init failed! ",err);
    callback(err);
  });
}

// for oauth grants
exports.getGrant = function(code, callback) {
  dal.query("SELECT account, app FROM Grants WHERE code = ? LIMIT 1", [code], function(err, rows) {
    rows = rows || [];
    callback(err, rows[0]);
  });
}

// temporary cache of grants for oauth
exports.addGrant = function(code, account, app, callback) {
  dal.query("INSERT INTO Grants (code, account, app) VALUES (?, ?, ?)", [code, account, app], callback);
}

// cleanup!
exports.delGrant = function(code, callback) {
  dal.query("DELETE FROM Grants WHERE code = ?", [code], callback);
}


// looks for any account matching this app+profile
exports.getAppProfile = function(id, app, profile, callback) {
  logger.debug("getting app profile "+app+" "+profile);
  var sql = "SELECT account FROM Accounts WHERE app = ? AND profile = ? ";
  var binds = [app, profile];
  if(id) {
    sql += "AND account = ? ";
    binds.push(id);
  }
  dal.query(sql, binds, function(err, rows) {
    rows = rows || [];
    callback(err, rows[0], rows.length);
  });
}

// validates an account against an app
exports.isAppAccount = function(app, account, callback) {
  dal.query("SELECT account FROM Accounts WHERE app = ? AND account = ? LIMIT 1", [app, account], function(err, rows) {
    callback(rows && rows.length > 0);
  });
}


// account id is optional, creates new random one and returns it if none
exports.addAppProfile = function(id, app, profile, callback) {
  logger.debug("adding app profile "+id+" "+app+" "+profile);
  id = id || require('crypto').createHash('md5').update(Math.random().toString()).digest('hex');
  dal.query("INSERT INTO Accounts (account, app, profile) VALUES (?, ?, ?)", [id, app, profile], function(err) {
    callback(err, {account:id, app:app, profile:profile});
  });
}

// convenience to find existing or create new if none
exports.getOrAdd = function(id, app, profile, callback) {
  // lookup app+profile, if existing return account id, if none create one
  exports.getAppProfile(id, app, profile, function(err, account, count) {
    if(err) return callback(err);
    if(account) return callback(null, account, count);
    exports.addAppProfile(id, app, profile, callback);
  });
}

exports.getAppsForAccount = function(account, callback) {
  logger.debug("getting apps for account "+account);
  dal.query("SELECT app, secret, apikeys, notes FROM Apps", [], function(err, rows) {
    var apps = [];
    for (var i = 0; i < rows.length; i++) {
      try {
        rows[i].notes = JSON.parse(rows[i].notes);
      } catch(E) {
        rows[i].notes = {};
      }
      if (rows[i].notes && rows[i].notes.account && rows[i].notes.account === account) {
        apps.push(rows[i]);
      }
    }
    callback(err, apps);
  });
};

// just fetch the info for a given app id
exports.getApp = function(app, callback) {
  logger.debug("getting app "+app);
  // TODO: add memcached caching here, this is called on every pipeline now!
  dal.query("SELECT app, secret, apikeys, notes FROM Apps WHERE app = ? LIMIT 1", [app], function(err, rows) {
    rows = rows || [];
    // optionally parse any json
    if(rows[0])
    {
      try {
        rows[0].apikeys = JSON.parse(rows[0].apikeys);
      } catch(E) {
        rows[0].apikeys = {};
      }
      try {
        rows[0].notes = JSON.parse(rows[0].notes);
      } catch(E) {
        rows[0].notes = {};
      }
    }
    callback(err, rows[0]);
  });
};

// return the full list (used by dawg)
exports.getApps = function(callback) {
  dal.query("SELECT app FROM Apps", [], function(err, rows) {
    callback(err, rows);
  });
};


// create a new app and generate it's keys
exports.addApp = function(notes, callback) {
  // may want to encrypt something into this id someday
  app = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
  secret = crypto.createHash('md5').update(Math.random().toString()).digest('hex');
  logger.debug("creating new app", app);
  var q = dal.query("INSERT INTO Apps (app, secret, notes) VALUES (?, ?, ?)", [app, secret, JSON.stringify(notes)], function(err) {
    if(err) logger.error(q, err);
    if(err) return callback(err);
    notes.key = app;
    notes.secret = secret;
    callback(null, notes);
  });
};

// update the notes field which contains the user configurable data
exports.updateApp = function(appId, newNotes, newKeys, callback) {
  logger.debug("updating app "+appId);
  var q = dal.query("UPDATE Apps set notes=?, apikeys=? WHERE app=?", [JSON.stringify(newNotes), JSON.stringify(newKeys), appId], function(err) {
    if (err) logger.error("query failed: ", q, err);
    callback(err);
  });
};

// remove a developer's app
exports.deleteApp = function(appId, callback) {
  logger.debug("deleting app "+appId);
  var q = dal.query("DELETE FROM Apps WHERE app=?", [appId], function(err) {
    if (err) logger.error("query failed: ", q, err);
    var q = dal.query("DELETE FROM Accounts WHERE app=?", [appId], function(err) {
      if (err) logger.error("query failed: ", q, err);
      callback(err);
    });
  });
};

// for a given account, return all the profiles
exports.getProfiles = function(account, callback) {
  logger.debug("getting account profiles "+account);
  dal.query("SELECT profile FROM Accounts WHERE account = ?", [account], function(err, rows) {
    rows = rows || [];
    // TODO make this result set easier to use by indexing the service name mappings
    callback(err, rows);
  });
};

// Get just one profile for an account
exports.getProfile = function(account, pid, callback) {
  logger.debug("getting account profile " + account + ', ' + pid);
  dal.query("SELECT profile FROM Accounts WHERE account = ? AND profile = ?",
            [account, pid], function(err, rows) {
    callback(err, (rows || [])[0]);
  });
}

// whackawhacka
exports.delProfiles = function(account, callback) {
  logger.debug("deleting account profiles "+account);
  dal.query("DELETE FROM Accounts WHERE account = ?", [account], callback);
}

// whackawhacka
exports.delProfile = function(account, pid, callback) {
  logger.debug("deleting account profile ",account,pid);
  dal.query("DELETE FROM Accounts WHERE account = ? AND profile = ?", [account, pid], callback);
}


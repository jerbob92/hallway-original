var lconfig = require("lconfig");
var dal = require('dal');
var logger = require('logger').logger('acl');
var crypto = require('crypto');
var ijod = require("ijod");

exports.init = function(callback) {
  logger.debug("Accounts DB Check");
  logger.debug("If this spins, you need to import the database or otherwise check your connection settings.");
  callback();
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

// construct a unique device id and associate it with an account, only do this if there isn't one already
exports.addDevice = function(id, app, device, callback) {
  var pid = [device,id,app].join('.') + '@devices';
  exports.addAppProfile(id, app, pid, callback);
}

// convenience to find existing or create new if none
exports.getOrAdd = function(id, app, profile, callback) {
  // lookup app+profile, if existing return account id, if none create one
  exports.getAppProfile(id, app, profile, function(err, account, count) {
    if(err) return callback(err);
    if(account) return callback(null, account, count);
    // At this point we know we're creating a new user only so let's do some gating
    ijod.getOne("gate:" + app, function(err, entry) {
      if (err) {
        logger.error("Error getting ijod for gating: %s", err);
      }
      if (err || !entry || entry.users === undefined) {
        // These need to all get cleaned up, so log and find with papertrail
        logger.warn(entry);
        logger.warn("App without gate info: %s", app);
        entry = {users:-1};
      }
      // If the users is set to 0 they are disabled from user creation
      if (entry.users == 0) return callback(new Error("This application has been disabled from accepting new accounts."));
      dal.query("SELECT COUNT(DISTINCT account) as userCount FROM Accounts WHERE app = ?", [app], function (err, rows) {
        if (err) return callback(new Error("There was a database error while adding the account."));
        if (rows.length == 0) rows = [{userCount:0}]; // Make sure we always have something to check below
        // Warn if the number of users is greater than allowed users
        // always allow the auth, though
        if (entry.users > 0 && rows[0].userCount >= entry.users) {
          logger.warn("App with more than allowed users: %s", app);
        }
        exports.addAppProfile(id, app, profile, callback);
      });
    });
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
      if (exports.hasAppPerms(account, rows[i])) apps.push(rows[i]);
    }
    callback(err, apps);
  });
};

// centralize this logic
exports.hasAppPerms = function(account, app)
{
  if(!app) return false;
  if(!app.notes) return false;
  if(account === app.notes.account) return true;
  if(Array.isArray(app.notes.collab) && app.notes.collab.indexOf(account) >= 0) return true;
  return false;
}

/* Retrieve the number of accounts on a particular app */
exports.getAppAccountCount = function(appId, callback) {
  logger.debug("Counting accounts for app " + appId);
  var query = "SELECT COUNT(DISTINCT account) as count FROM Accounts WHERE app = ?";
  dal.query(query, [appId], function (err, results) {
    if (err || results.length == 0) return callback(new Error ('Could not find accounts for app ' + appId));
    else return callback (null, results[0]);
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

// validate that the account has permission to the app first, or error
exports.getAppFor = function(appId, account, callback)
{
  exports.getApp(appId, function(err, app){
    if(err) return callback(err);
    if(!app) return callback("no such app");
    if(!exports.hasAppPerms(account, app)) return callback("no permission");
    callback(null, app);
  });
}

// return the full list (used by dawg)
exports.getApps = function(callback) {
  dal.query("SELECT app FROM Apps", [], function(err, rows) {
    callback(err, rows);
  });
};


// create a new app and generate it's keys
exports.addApp = function(notes, callback) {
  // may want to encrypt something into this id someday
  app = (typeof notes.key == 'string' && notes.key.length > 0) ? notes.key : crypto.createHash('md5').update(Math.random().toString()).digest('hex');
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

// for a given account, return all the profiles
exports.getManyProfiles = function(app, accounts, callback) {
  logger.debug("getting many profiles ",app,accounts);
  var ins = accounts.map(function(){return '?'}).join(',');
  accounts.unshift(app);
  dal.query("SELECT profile FROM Accounts WHERE app = ? and account in ("+ins+")", accounts, function(err, rows) {
    rows = rows || [];
    var ret = {};
    rows.forEach(function(row){
      ret[row.profile] = true;
    })
    callback(err, ret);
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


var async = require('async');

var lib = require('./lib');

exports.init = function(_host, _auth, _ignoredUsers) {
  lib.init(_host, _auth, _ignoredUsers);
};

exports.title = 'New accounts';

exports.run = function(options, callback) {
  var hours = options.hours;
  lib.getAccounts(hours, function(app) {
    return (app.notes.appName === 'Default Singly App'
          || app.notes.appName === 'Singly Development Sandbox');
  }, function(err, rows) {
    async.forEachSeries(rows, function(row, cbEach) {
      lib.getHits(row.profile.apps[0].app, hours, function(err, accounts) {
        if (err) console.error('err', err);
        if (err) return cbEach(err, accounts);
        row.hits = 0;
        if (!accounts) return cbEach();

        Object.keys(accounts).forEach(function(account) {
          row.hits += accounts[account];
        });
        cbEach();
      });
    }, function(err) {
      callback(err, rows);
    });
  });
};

exports.mapRow = function(row) {
  return [
    {
      href: 'https://dawg.singly.com/apps/account?id=' + row.id,
      text: row.id,
      truncate: 6
    },
    {
      href: row.profile.url,
      text: row.profile.name || row.profile.handle
    },
    row.profile.location,
    row.profile.email,
    row.hits
  ];
};

exports.columnNames = ['Account','Name','Loc','Email','Sandbox Hits'];

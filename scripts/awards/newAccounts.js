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
  }, callback);
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
    row.profile.email
  ];
};

exports.columnNames = ['Account','Name','Loc','Email'];

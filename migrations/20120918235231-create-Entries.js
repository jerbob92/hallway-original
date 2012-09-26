var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
  db.createTable('Entries', {
    columns: {
      base: {type: 'binary', length: 30, notNull: true},
      idr: {type: 'binary', length: 16, notNull: true},
    },
    ifNotExists: true
  }, callback);
};

exports.down = function(db, callback) {

};

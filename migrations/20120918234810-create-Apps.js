var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
  db.createTable('Apps', {
    ifNotExists: true,
    columns: {
      app: { type: 'string', primaryKey: true, notNull: true},
      secret: {type: 'string', defaultValue: 'NULL'},
      apikeys: {type: 'text'},
      notes: {type: 'text'},
      cat: {type: 'timestamp', defaultValue: 'CURRENT_TIMESTAMP'}
    }
  }, callback);
};

exports.down = function(db, callback) {

};

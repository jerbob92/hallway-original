var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
  db.createTable('Accounts', {
    columns: {
      id: { type: 'int', primaryKey: true, autoIncrement: true, unsigned: true},
      account: {type: 'string', defaultValue: 'NULL'},
      app: {type: 'string', defaultValue: 'NULL'},
      profile: {type: 'string', defaultValue: 'NULL'},
      cat: {type: 'timestamp', defaultValue: 'CURRENT_TIMESTAMP'}
    },
    ifNotExists: true
  }, callback);
};

exports.down = function(db, callback) {

};

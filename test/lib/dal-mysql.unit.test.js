var should = require('chai').should();

var lconfig = require('lconfig');
var logger = require('logger').logger('dal-mysql-test');
var mysql = require('dal-mysql');

if (lconfig.database.database !== 'test') {
  logger.warn('Database name not set to \'test\'; bypassing dal-mysql tests!');
} else {
  describe('dal-mysql', function () {
    describe('#create', function () {
      it('should create and connect a client', function (done) {
        mysql.create(lconfig.database, function (err, instance) {
          if (err) return done(err);

          should.exist(instance);

          done();
        });
      });
    });

    describe('#destroy', function () {
      var client;

      before(function (done) {
        mysql.create(lconfig.database, function (err, instance) {
          if (err) return done(err);

          client = instance;

          done();
        });
      });

      it('should destroy an instance', function () {
        mysql.destroy(client);
      });
    });

    describe('Db', function () {
      var client;

      before(function (done) {
        mysql.create(lconfig.database, function (err, instance) {
          if (err) return done(err);

          client = instance;

          done();
        });
      });

      after(function () {
        mysql.destroy(client);
      });

      describe('#sqlize', function () {
        it('should properly prepare a statement', function () {
          var sqlized = client.sqlize('SELECT * FROM table WHERE abc = ?', ['xyz']);

          sqlized.should.equal('SELECT * FROM table WHERE abc = \'xyz\'');
        });
      });
    });
  });
}

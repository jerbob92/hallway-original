var should = require('chai').should();

var dalFake = require('dal-fake');

describe('dal-fake', function () {
  var fake;

  beforeEach(function (done) {
    dalFake.reset();

    dalFake.create({}, function (err, instance) {
      fake = instance;

      done();
    });
  });

  describe('the dal interface', function () {
    it('should create a DB instance', function () {
      should.exist(fake);
    });
  });

  describe('the fake interface', function () {
    it('should allow a fake to be added with a javascript array',
      function (done) {
      dalFake.addFake(/^SELECT/i, [{ id: 1, test: 'abc' }]);

      fake.query('SELECT * FROM testing', [], function (err, rows) {
        should.exist(rows);

        rows.should.be.an('array');

        rows[0].should.deep.equal({ id: 1, test: 'abc' });

        done();
      });
    });

    it('should allow for a fake to be added from a JSON file contents');
    it('should allow a no-op fake to be added');

    it('should be reset to no loaded fakes', function (done) {
      fake.query('SELECT * FROM testing', [], function (err, rows) {
        should.exist(err);
        should.not.exist(rows);

        done();
      });
    });
  });

  describe('the db interface', function () {
    it('should succesfully return fake data for a query');
    it('should support binds in fake queries');
    it('should return the an object with the sql being ran');
  });
});

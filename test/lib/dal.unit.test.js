require('chai').should();

var lconfig = require('lconfig');

if (!lconfig.database) lconfig.database = {};

var dal = require('dal');

describe('dal', function () {
  // Query tests should be performed in the file for their specific backends,
  // i.e. dal-mysql.unit.test.js, dal-fake.unit.test.js
  it('should default to mysql', function () {
    dal.getBackend().should.equal('mysql');
  });
});

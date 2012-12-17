require('chai').should();

var dMap = require('dMap');
var entries = require('entries');

before(dMap.startup);

describe('Entries', function () {
  describe('options', function () {
    it('should do nothing', function () {
      entries.options({});
    });
  });

  describe('filter', function () {
    it('should not crash', function () {
      entries.filter([], {});
    });
  });

  describe('bases', function () {
    it('should do services', function () {
      entries.bases('/services/twitter/friends', {},
        ['42@twitter', '69@twitter']).length.should.equal(2);
      entries.bases('/services/twitter/friends', {services: '42@twitter'},
        ['42@twitter', '69@twitter']).length.should.equal(1);
    });

    it('should do types', function () {
      entries.bases('/types/photos', {}, ['42@twitter', '69@facebook'])
        .length.should.equal(2);
      entries.bases('/types/photos', {services: 'twitter'},
        ['42@twitter', '69@facebook']).length.should.equal(1);
    });
  });
});

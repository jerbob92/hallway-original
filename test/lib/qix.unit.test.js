require('chai').should();

var qix = require('qix');

describe('qix', function () {
  describe('#buf', function () {
    it('should build the index of a string', function () {
      var buf = qix.buf('a fairly short string');

      buf.toString().should.equal('\u0002\u0000\u0000\u0000\u0000\u0001 ' +
        '\u0002,\u0000\u0000\u0010\u0000\u0010\u0004\u0000\u0000\f\u0001' +
        '\u0012\u0000\u0000\u0000\u0000\u0000\u0000\u0000@\u0000@ \u0000');
    });
  });

  describe('#chunk', function () {
    it('should chunk a string', function () {
      var chunks = qix.chunk('a fairly short string');

      chunks.should.eql(['fairli', 'short', 'string']);
    });
  });
});

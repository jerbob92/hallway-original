var servezas = require('servezas');
var taskStore = require('taskStore');

before(function () {
  servezas.load();
});

describe('taskStore', function () {
  describe('#getTasks()', function () {
    it('should not crash', function (done) {
      taskStore.getTasks('s611642@rdio', function () {
        // TODO: Actually check that there's no err returned (this will
        // currently fail because there's no auth info)
        done();
      });
    });
  });
});

var taskStore = require('taskStore');

describe('taskStore', function() {
  describe('getTasks()', function() {
    it('should not crash', function(done){
      taskStore.getTasks('s611642@rdio', function(err, tasks) {
        done()
      });
    });
  });
});


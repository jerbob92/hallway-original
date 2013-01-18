var chai = require('chai');
var assert = chai.assert;

chai.should();

var lutil = require('lutil');

describe('lutil', function () {
  describe('#parseProfileId()', function () {
    it('should parse a profile with one @', function () {
      var profile = lutil.parseProfileId('abc@picasa');

      profile.id.should.equal('abc');
      profile.service.should.equal('picasa');
    });

    it('should parse a profile with more than one @', function () {
      var profile = lutil.parseProfileId('abc@N01@flickr');

      profile.id.should.equal('abc@N01');
      profile.service.should.equal('flickr');
    });
  });

  describe('#isTrue()', function() {
    it('should return true if true', function() {
      assert.isTrue(lutil.isTrue(true));
    });

    it('should return true if "true"', function () {
      assert.isTrue(lutil.isTrue("true"));
    });

    it('should return true if 1', function() {
      assert.isTrue(lutil.isTrue(1));
    });

    it('should return true if "1"', function() {
      assert.isTrue(lutil.isTrue("1"));
    });

    it('should return true if "yes"', function() {
      assert.isTrue(lutil.isTrue("yes"));
    });

    it('should return false if false', function() {
      assert.isFalse(lutil.isTrue(false));
    });

    it('should return false if 0', function() {
      assert.isFalse(lutil.isTrue(0));
    });

    it('should return false if "0"', function() {
      assert.isFalse(lutil.isTrue("0"));
    });

    it('should return false if "no"', function() {
      assert.isFalse(lutil.isTrue("no"));
    });

    it('should return false if "string"', function() {
      assert.isFalse(lutil.isTrue("string"));
    });
  });

  describe('#selectFields', function() {
    it('returns the object when you select nothing', function() {
      assert.deepEqual(
        lutil.selectFields({name: 'Kristján'}, []),
        {name: 'Kristján'}
      );
    });

    it('selects fields from a simple object', function() {
      assert.deepEqual(
        lutil.selectFields({
          name: 'Kristján',
          email: 'kristjan@singly.com',
          nickname: 'kripet'
        }, 'name,nickname'),
        {
          name: 'Kristján',
          nickname: 'kripet'
        }
      );
    });

    it('selects objects from a simple object', function() {
      assert.deepEqual(
        lutil.selectFields({
          name: 'Kristján',
          email: 'kristjan@singly.com',
          company: {
            name: 'Singly',
            city: 'San Francisco'
          }
        }, 'company'),
        {
          company: {
            name: 'Singly',
            city: 'San Francisco'
          }
        }
      );
    });

    it('selects deeply', function() {
      assert.deepEqual(
        lutil.selectFields({
          its: {
            way: {
              down: {
                here: true,
                there: false
              }
            },
            over: {
              here: true,
              there: false
            }
          }
        }, 'its.way.down.here'),
        {
          its: {
            way: {
              down: {
                here: true
              }
            }
          }
        }
      );
    });

    it('selects whole arrays', function() {
      assert.deepEqual(
        lutil.selectFields({
          name: 'Kristján',
          likes: [
            {
              name: 'tea',
              howmuch: 3
            },
            {
              name: 'puns',
              howmuch: 11
            },
            {
              name: 'climbing',
              howmuch: 5
            }
          ]
        }, 'likes'),
        {
          likes: [
            {
              name: 'tea',
              howmuch: 3
            },
            {
              name: 'puns',
              howmuch: 11
            },
            {
              name: 'climbing',
              howmuch: 5
            }
          ]
        }
      );
    });

    it('dives into arrays', function() {
      assert.deepEqual(
        lutil.selectFields({
          name: 'Kristján',
          likes: [
            {
              name: 'tea',
              howmuch: 3
            },
            {
              name: 'puns',
              howmuch: 11
            },
            {
              name: 'climbing',
              howmuch: 5
            }
          ]
        }, 'likes.name'),
        {
          likes: [
            {name: 'tea'},
            {name: 'puns'},
            {name: 'climbing'}
          ]
        }
      );
    });

    it('dives deep into arrays', function() {
      assert.deepEqual(
        lutil.selectFields({
          person: {
            name: 'Kristján',
            work: [
              {
                employer: {
                  name: 'Singly',
                  id: 2
                },
                address: {
                  city: 'San Francisco',
                  state: 'CA'
                }
              },
              {
                employer: {
                  name: 'Causes',
                  id: 1
                },
                address: {
                  city: 'Berkeley',
                  state: 'CA'
                }
              }
            ]
          }
        }, 'person.name,person.work.employer.name'),
        {
          person: {
            name: 'Kristján',
            work: [
              {
                employer: {
                  name: 'Singly'
                }
              },
              {
                employer: {
                  name: 'Causes'
                }
              }
            ]
          }
        }
      );
    });

    it('selects nested fields', function() {
      assert.deepEqual(
        lutil.selectFields({
          contact: {
            name: 'Kristján',
            email: 'kristjan@singly.com',
            nickname: 'kripet'
          }
        }, 'contact.name,contact.nickname'),
        {
          contact: {
            name: 'Kristján',
            nickname: 'kripet'
          }
        }
      );
    });

    it('stops nesting at non-objects', function() {
      assert.deepEqual(
        lutil.selectFields({
          name: 'Kristján',
          email: 'kristjan@singly.com',
          nickname: 'kripet'
        }, 'name.boom,name.bang,nickname.biff'),
        {
          name: 'Kristján',
          nickname: 'kripet'
        }
      );
    });

    it('ignores nonexistant fields', function() {
      assert.deepEqual(
        lutil.selectFields({
          hes: {
            somewhere: false
          },
          shes: {
            there: true
          }
        }, 'missing,shes.notthere,nothing.to.see'),
        {
          shes: {}
        }
      );
    });

  });

  describe('trimObject', function() {
    it('trims top-level strings', function() {
      assert.deepEqual(
        lutil.trimObject({
          shave: '  haircut  '
        }),
        {
          shave: 'haircut'
        }
      );
    });

    it('trims nested strings', function() {
      assert.deepEqual(
        lutil.trimObject({
          shave: {
            haircut: '    two pence   '
          }
        }),
        {
          shave: {
            haircut: 'two pence'
          }
        }
      );
    });

    it('ignores non-strings', function() {
      assert.deepEqual(
        lutil.trimObject({
          shave: 1
        }),
        {
          shave: 1
        }
      );
    });
  });
});

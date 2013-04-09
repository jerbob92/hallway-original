require('chai').should();

var fakeweb = require('node-fakeweb');
var path = require('path');

var helper  = require(path.join(__dirname, '..', '..', 'support', 'locker-helper.js'));

var self = require(path.join('services', 'linkedin', 'self.js'));
var updates = require(path.join('services', 'linkedin', 'updates.js'));
var network = require(path.join('services', 'linkedin', 'network.js'));
var lib = require(path.join('services', 'linkedin', 'lib.js'));

var dal = require('dal');

dal.setBackend('fake');

var ijod = require('ijod');

before(ijod.initDB);

describe("linkedin connector", function () {
  var pinfo;

  beforeEach(function () {
    fakeweb.allowNetConnect = false;

    pinfo = helper.loadFixture(path.join(__dirname, '..', '..', 'fixtures', 'connectors', 'linkedin.json'));
  });

  afterEach(function () {
    fakeweb.tearDown();
  });

  describe("self synclet", function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: 'http://api.linkedin.com:80/v1/people/~:(id,first-name,last-name,email-address,headline,location:(name,country:(code)),industry,current-share,num-connections,summary,specialties,proposal-comments,associations,honors,interests,positions,publications,patents,languages,skills,certifications,educations,num-recommenders,recommendations-received,phone-numbers,im-accounts,twitter-accounts,date-of-birth,main-address,member-url-resources,picture-url,site-standard-profile-request:(url),api-standard-profile-request:(url),site-public-profile-request:(url),api-public-profile-request:(url),public-profile-url)?format=json',
        headers: { "Content-Type": "text/plain" },
        file: __dirname + '/../../fixtures/synclets/linkedin/self.json'
      });
    });

    it('can fetch profile information', function (done) {
      self.sync(pinfo, function (err, response) {
        if (err) return done(err);
        response.data['profile:42@linkedin/self'][0].id.should.equal("42");
        done();
      });
    });
  });

  describe("updates synclet", function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: 'http://api.linkedin.com:80/v1/people/~/network/updates?format=json&scope=self&count=250',
        headers: { "Content-Type": "text/plain" },
        file: __dirname + '/../../fixtures/synclets/linkedin/updates.json'
      });
    });

    it('can fetch updates', function (done) {
      updates.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['update:42@linkedin/updates'][0].updateKey
          .should.equal("UNIU-148054073-5606400884670988288-SHARE");

        done();
      });
    });
  });

  describe("network synclet", function () {
    beforeEach(function () {
      fakeweb.registerUri({
        uri: 'http://api.linkedin.com:80/v1/people/~/network/updates?format=json&count=250',
        headers: { "Content-Type": "text/plain" },
        file: __dirname + '/../../fixtures/synclets/linkedin/network.json'
      });

      fakeweb.registerUri({
        uri: 'http://api.linkedin.com:80/v1/people/id=mBB9tEfLQ4:' +
          lib.PROFILE_FIELDS + '?format=json',
        headers: { "Content-Type": "text/plain" },
        file: __dirname + '/../../fixtures/synclets/linkedin/self.json'
      });
    });

    it('can fetch updates and connections', function (done) {
      network.sync(pinfo, function (err, response) {
        if (err) return done(err);

        response.data['profile:42@linkedin/connections'][0].id.should.equal('42');
        response.data['update:42@linkedin/network'][0].updateKey
          .should.equal("PROF-11716101-5666990229756579740-*1");

        done();
      });
    });
  });
});

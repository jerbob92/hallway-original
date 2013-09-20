/*
* Copyright (C) 2012 Singly, Inc. All Rights Reserved.
*
* Redistribution and use in source and binary forms, with or without
* modification, are permitted provided that the following conditions are met:
*    * Redistributions of source code must retain the above copyright
*      notice, this list of conditions and the following disclaimer.
*    * Redistributions in binary form must reproduce the above copyright
*      notice, this list of conditions and the following disclaimer in the
*      documentation and/or other materials provided with the distribution.
*    * Neither the name of Singly nor the
*      names of its contributors may be used to endorse or promote products
*      derived from this software without specific prior written permission.
*
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
* ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
* WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
* DISCLAIMED. IN NO EVENT SHALL SINGLY, INC. BE LIABLE FOR ANY
* DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
* (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
* LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
* ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
* (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
* SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var serializer = require('serializer');
var logger = require('logger').logger('tokenz');
var lconfig = require('lconfig');
var FirebaseTokenGenerator = require("firebase-token-generator");
var apiKeys = require('apiKeys');
var acl = require('acl');
var profileManager = require('profileManager');
var lutil = require('lutil');
var anubis = require('anubis');

// warn after 10 days
var TOKEN_TTL = 10 * 24 * 60 * 60 * 1000;

var SERIAL;
var SERIAL_OLD;

exports.init = function (cbDone) {
  SERIAL = serializer.createSecureSerializer(lconfig.authSecrets.crypt,
    lconfig.authSecrets.sign);
  SERIAL_OLD = serializer.createSecureSerializer(lconfig.authSecrets.oldcrypt,
    lconfig.authSecrets.oldsign);

  exports.serializer = SERIAL;

  cbDone();
};

exports.createAccessToken = function (account, appID, template, cbDone) {
  logger.debug("CREATING ACCESS TOKEN ", account, appID, template);

  apiKeys.getKeys("firebase", appID, function (keys) {
    template = template || {};

    // firebase token generation automation for apps
    if (keys) {
      logger.info("creating firebase token for", appID, keys.appKey);

      var tokenGenerator = new FirebaseTokenGenerator(keys.appSecret);
      template.firebase = tokenGenerator.createToken(
        {account: account},
        {expires: 4084818935}); // expires in 2099
    }

    // save the actual token w/ url friendly format
    template.access_token = SERIAL.stringify([account, appID, Date.now()])
      .replace(/\=/g, '.');
    template.account = account;

    cbDone(null, template);
  });
};

exports.parseAccessToken = function (atok) {
  var data = [];

  // above we escape equalzes, fix em up here
  atok = atok && atok.replace(/\./g, '=');

  try {
    data = SERIAL.parse(atok);
  } catch (e) {
    try {
      data = SERIAL_OLD.parse(atok);
    } catch (e) {
      logger.error(e);

      throw new Error('Invalid OAuth access token.');
    }

    logger.warn("depreciated token", atok, data);
  }

  return {
    account: data[0],
    app: data[1],
    at: new Date(data[2])
  };
};

// called to validate tokens on any request
exports.login = function (req, res, next) {
  var atok;

  if (req.param('access_token')) {
    atok = req.param('access_token');
  } else if ((req.headers.authorization || '').indexOf('Bearer ') === 0) {
    atok = req.headers.authorization.replace('Bearer', '').trim();
  } else {
    return next();
  }

  var token;

  try {
    token = exports.parseAccessToken(atok);
  } catch (e) {
    return res.json(lutil.jsonErr("Invalid OAuth access token."), 400);
  }

  // for all api requests, they're legit now
  acl.getProfiles(token.account, function (err, profiles) {
    if (err || !profiles || profiles.length === 0) {
      logger.warn('error getting profile', err, profiles, JSON.stringify(token));
    } else {
      token.profiles = profiles;
      req._authsome = token;
      if (req.query && req.url.indexOf('/proxy/') === -1) {
        req.query._app = token.app; // stash this here for entries.options, hack
      }
    }

    next();
  });
};

// the /oauth/access_token endpoint
exports.access_token = function (req, res) {
  var appID = req.param('client_id');
  var appSecret = req.param('client_secret');
  var code = req.param('code');
  var profile = req.param('profile');
  var account;

  function end(err, template) {
    logger.debug("returning", err, appID, account, template);
    anubis.log(null, {
      act: 'auth',
      app: appID,
      type: 'auth',
      stage: 'granted',
      user: account,
      error: err
    });
    if (err) logger.warn("oauth handshake failed", err);
    if (err) return res.json(lutil.jsonErr(err), 400);
    exports.createAccessToken(account, appID, template, function (err, atok) {
      if (err) return res.json(lutil.jsonErr(err), 500);
      res.send(atok);
    });
  }

  if (!appID) return end("missing client_id");
  if (!appSecret) return end("missing client_secret");
  if (!code) return end("missing code");

  logger.debug("LOOKUPGRANT", appID, code);

  acl.getApp(appID, function (err, app) {
    if (err) return end(err);
    if (!app) return end("client_id isn't found");
    if (app.secret !== appSecret) return end('client_secret mismatch');

    acl.getGrant(code, function (err, grant) {
      if (err) return end(err);
      logger.debug(grant);
      if (!grant || !grant.account) {
        return end('invalid code, perhaps it was used twice?');
      }
      if (grant.app !== appID) return end('code is for a different client_id');
      account = grant.account;
      if (!profile) return end();

      // they want more sent back
      logger.debug("on-token profile generation", profile);

      acl.getProfiles(account, function (err, profiles) {
        profiles = profiles || {};
        var options = {};
        options.app = app.app;
        options.account = account;
        options.auth = lutil.isTrue(req.param('auth'));
        options.full = lutil.isTrue(req.param('full'));

        // only use the last pid if requested
        if (profile === 'last') {
          var good = [];
          profiles.forEach(function (x) {
            if (x.profile === grant.pid) good.push(x);
          });
          profiles = good;
        }

        profileManager.genProfile(profiles, options, function (err, ret) {
          end(null, { profile: ret });
        });
      });
    });
  });
};

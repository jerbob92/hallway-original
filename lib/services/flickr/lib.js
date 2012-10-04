/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var request = require('request');
var urllib = require('url');
var qs = require('querystring');
var OAlib = require('oauth').OAuth;

var Flickr = require('flickr-js');

exports.getPage = function(pi, endpoint, type, perPage, params, callback) {
    var config = pi.config || {};
    var auth = pi.auth;

    var oa = new OAlib('http://www.flickr.com/services/oauth/request_token'
     , 'http://www.flickr.com/services/oauth/access_token'
     , pi.auth.consumerKey
     , pi.auth.consumerSecret
     , '1.0'
     , null
     , 'HMAC-SHA1'
     , null
     , {'Accept': '*/*', 'Connection': 'close'});

    //var client = new Flickr(auth.consumerKey, auth.consumerSecret);
    if (!config[type]) config[type] = {};
    if(!config[type].lastPage)
        config[type].lastPage = 0;
    var thisPage = config[type].lastPage + 1;
    params.auth_token = auth.token;
    params.per_page = perPage;
    params.page = thisPage;

    params.api_key = pi.auth.consumerKey;
    params.format = 'json';
    params.nojsoncallback = '1';
    params.method = endpoint;

    var type_s = type + 's';

    oa.getProtectedResource('http://api.flickr.com/services/rest/?' + qs.stringify(params),
    		'GET', pi.auth.token, pi.auth.tokenSecret,
    		function (err, data, response) {
     	    if (err) {
    		    console.error('Network Error: ', err);
    		    return cb(err);
    		  }

          var json = JSON.parse(data);
          //console.log(require('util').inspect(json, false, null));
          var page;
          var pages;
          if (json.stat && json.stat == "fail") {
            return callback(json.message);
          }
          try {
            page = parseInt(json[type_s].page);
            pages = parseInt(json[type_s].pages);
          } catch (E) {
            console.error("Error processing json: %s from %s", E, body);
            return callback("Error processing the json");
          }
          if(page > pages) { //whoa whoa whoa, bad news bears, page should never be greater than pages
              // seems like there is a possiblity of pages === 0 if there are no photos
              config[type].lastPage = 0;
              config[type].totalPages = -1;
              if (pages != 0) console.error('Flickr error, page > total pages: page ==', json[type_s].page, ', pages ==', json[type_s].pages);
          } else if(page === pages) { // last page
              config[type].lastPage = 0;
              config[type].totalPages = -1;
          } else { // still paging
              config[type].lastPage = page;
              config[type].totalPages = pages;
              config.nextRun = -1;
          }
          callback(null, config, json[type_s][type]);
    });
}

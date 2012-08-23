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
var querystring = require('querystring');


var Flickr = require('flickr-js');

exports.getPage = function(pi, endpoint, type, perPage, params, callback) {
    var config = pi.config || {};
    var auth = pi.auth;
    console.log(require('util').inspect(pi, false, null));
    var client = new Flickr(auth.consumerKey, auth.consumerSecret);
    config.paging = config.paging || {totalPages:-1};
    config.paging[type] = config.paging[type] || {};
    if(!config.paging[type].lastPage)
        config.paging[type].lastPage = 0;
    var thisPage = config.paging[type].lastPage + 1;
    config.lastUpdate = Date.now();
    params.auth_token = auth.accessToken;
    params.per_page = perPage;
    params.page = thisPage;
    
    var type_s = type + 's';
    
    client.apiCall('GET', endpoint, params,
        function(err, resp, body) {
        if(err)
            console.error('Network Error: ', err);
        else {
            var json = JSON.parse(body);
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
                config.paging[type].lastPage = 0;
                config.paging[type].totalPages = -1;
                config.nextRun = 0;
                if (pages != 0) console.error('Flickr error, page > total pages: page ==', json[type_s].page, ', pages ==', json[type_s].pages);
            } else if(page === pages) { // last page
                config.paging[type].lastPage = 0;
                config.paging[type].totalPages = -1;
                config.nextRun = 0;
            } else { // still paging
                config.paging[type].lastPage = page;
                config.paging[type].totalPages = pages;
                config.nextRun = -1;
            }
            callback(null, config, json[type_s][type]);
        }
    });
}
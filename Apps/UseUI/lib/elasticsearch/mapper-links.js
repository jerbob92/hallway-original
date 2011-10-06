var http = require('http');

exports.map = function(options) {
    options.path = '/locker/link/_mapping';
    options.method = 'PUT';
    
    var req = http.request(options, function(res) {
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        //console.log('BODY: ' + chunk);
      });
    });

    req.on('error', function(e) {
      console.log('problem with request: ' + e.message);
    });

    // write data to request body
    var map = {"message": {    
                    "ignore_conflicts" : true,
                    "properties" : {
                        "_id" : {"type" : "string"},
                        "timestamp" : {"type" : "string"},
                        "link" : {"type" : "string", "store" : "yes"}
                    }
                }
              };
    req.write(JSON.stringify(map));
    req.end();
};
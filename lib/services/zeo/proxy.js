exports.proxy = function(auth, req, res) {
  lib.apiCall({auth:auth, query: req.url, params: req.query}, function(err, body){
    res = body;  
  });
}

/* Does not support since because results are returned in ascending time order */
//can add such support by telling what page to start from?

var lib = require('./lib.js');



exports.sync = function(pi, cb) {
	var arg = {};
	arg.access_token = pi.auth.access_token;
	arg.path = '/2/photos';
	arg.startPage = pi.config.photoStartPage || 0;
	arg.offset = arg.startPage;
	arg.results = [];
	arg.params = {order:'time', member_id:'self'};
	lib.getData(arg,function(err, photos, newStartPage){
		if (err) cb(err);
		var data = {};
		pi.config.photoStartPage = newStartPage;
		data['photo:'+pi.auth.pid+'/photos'] = photos;
		cb(err, {data:data, config:pi.config});
	});
};

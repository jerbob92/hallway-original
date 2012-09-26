var lib = require('./lib.js');



exports.sync = function(pi, cb) {
	var arg = {};
	arg.access_token = pi.auth.access_token;
	arg.path = '/2/groups';
	arg.offset = 0;
	arg.results = [];
	arg.params = {member_id:'self'};
	lib.getData(arg,function(err, groups){
		if (err) return cb(err);
		var data = {};
		data['group:'+pi.auth.pid+'/groups'] = groups;
		cb(err, {data:data, config:pi.config});
	});
};

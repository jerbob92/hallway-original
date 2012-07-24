module.exports = {
  statuses: function(data, callback) {
    callback(null, {
      success: 'Posted to ' + data.service
    });
  }
};

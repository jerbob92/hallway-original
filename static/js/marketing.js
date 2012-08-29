function refresh() {
  $.getJSON('http://graph.facebook.com/singlyinc', function(facebook) {
    $('#facebook-likes').text(facebook.likes);
  });
}

$(function() {
  refresh();

  $('#refresh').click(function() {
    refresh();
  });
});

/*global commas:true humanTimeFromSeconds:true secondsFromHumanTime:true*/
function percentToNum(a) {
  a = $.text([a]);
  if (a === 'new') return -1;
  return parseFloat(a.replace('%', ''), 10);
}

function sortTable(index) {
  $('table').find('td').filter(function () {
    return $(this).index() === (index || 5);
  }).sortElements(function (a, b) {
    if (index === 5 || index === 4) {
      a = parseInt($.text([a]).replace(',', ''), 10);
      b = parseInt($.text([b]).replace(',', ''), 10);
    } else if (index === 3) {
      a = percentToNum(a);
      b = percentToNum(b);
    }

    return a > b ? -1 : 1;
  }, function () {
    return this.parentNode;
  });
}

function trimString(str, maxLength) {
  if (!str || str.length <= maxLength) {
    return str;
  }

  return str.slice(0, maxLength - 1) + '…';
}

function updateSelected() {
  var state = $.bbq.getState();

  $('a.time').removeClass('selected');

  if (state.appSince) {
    $('a[data-parameter=app][data-time=' +
      humanTimeFromSeconds(state.appSince) + ']').addClass('selected');
  } else {
    $('a[data-parameter=app][data-time=forever]').addClass('selected');
  }

  if (state.accountSince) {
    $('a[data-parameter=account][data-time=' +
      humanTimeFromSeconds(state.accountSince) + ']').addClass('selected');
  } else {
    $('a[data-parameter=account][data-time=forever]').addClass('selected');
  }
}

function appAccount(account) {
  $.getJSON('/apps/account', { id: account }, function (data) {
    if (!data || !data.token) {
      return window.alert("I AM LOST! Heeeeeeellllllllpppppp");
    }

    window.location = 'https://api.singly.com/profile?access_token=' +
      data.token;
  });

  return false;
}

function refresh() {
  updateSelected();

  var options = {};

  var state = $.bbq.getState();

  if (state.appSince) {
    options.appSince = moment().subtract('seconds',
      parseInt(state.appSince, 10)).unix();
  }

  if (state.accountSince) {
    options.accountSince = moment().subtract('seconds',
      parseInt(state.accountSince, 10)).unix();
  }

  $.getJSON('/apps/accounts', options, function (appsAccounts) {
    $('#rows').html('');

    appsAccounts.forEach(function (app) {
      if (!app.details || !app.details.notes) {
        app.details = {
          notes: {
            appName: '',
            appUrl: ''
          }
        };
      } else {
        var max = isiPhone? 16: 40;
        app.details.notes.appUrl = '<a href="' + app.details.notes.appUrl +
          '">' + trimString(app.details.notes.appUrl, max) + '</a>';
        app.details.notes.appName = trimString(app.details.notes.appName, max);
      }

      var email = '';

      if (app.details.profile &&
        app.details.profile.data &&
        app.details.profile.data.email) {
        email = '<a href="mailto:' + app.details.profile.data.email + '">' +
          app.details.profile.data.email + '</a>';
      }

      if (app === 'total') {
        return;
      }

      if (!app.created) {
        app.created = '';
      } else {
        var format = isiPhone? "M/D/YY" : "M/D/YYYY h:mma";
        app.created = moment(app.created).format(format);
      }

      var ratio = Math.round((app.profiles / app.accounts) * 100) / 100;

      // seven day growth %
      var percentGrowth = 'new';

      if (app.accountsBefore === app.accounts) {
        percentGrowth = '0%';
      } else if (app.accounts > 2 && app.accountsBefore > 0) {
        var newAccounts = app.accounts - app.accountsBefore;

        percentGrowth = newAccounts / app.accountsBefore * 100;
        percentGrowth = Math.round(percentGrowth * 10) / 10;
        percentGrowth += '%';
      }

      var cnt = 0;

      $('#rows').append('<tr>' +
        '<td class="app-id"><a href="/app/info/'+app.id+'">'+app.id.substring(0,6)+'</a></td>' +
        '<td class="app-name">' + app.details.notes.appName + '</td>' +
        '<td class="app-url">' + app.details.notes.appUrl  + '</td>' +
        '<td class="7-day">' + percentGrowth + '</td>' +
        '<td class="accounts">' + commas(app.accounts) + '</td>' +
        '<td class="profiles">' + commas(app.profiles) + '</td>' +
        '<td class="ratio">' + ratio + '</td>' +
        '<td class="created">' + app.created + '</td>' +
        '<td class="accounts-list">'+app.accountList.map(function (account) {
          return '<a href="#" onClick="return appAccount(\'' + account +
          '\');">' + (++cnt) + '</a>';
        }).join(', ') + '</td>' +
      '</tr>');
    });

    $('#total > span').text(appsAccounts.length);

    sortTable(5);
  });
}

$(function () {
  $('a.time').click(function (e) {
    e.preventDefault();

    var $e = $(this);

    var type = $e.attr('data-parameter') + 'Since';

    var humanTime = $e.attr('data-time');

    if (humanTime === 'forever') {
      $.bbq.removeState(type);

      return;
    }

    var seconds = secondsFromHumanTime(humanTime);

    var state = {};

    state[type] = seconds;

    $.bbq.pushState(state);
  });

  refresh();

  $(window).bind('hashchange', function () {
    refresh();
  });

  $('#refresh').click(function () {
    refresh();
  });
});

function goFuzzy (now) {
  var list = document.body.getElementsByTagName('time');

  var months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ];

  for (var i = 0; i < list.length; i++) {
    var time = Date.parse(list[i].getAttribute('datetime'));
    var diff = Math.round((now - time) / 1000);

    if (diff < 60) {
      list[i].innerHTML = diff + 's';
    } else if (diff < 3600) {
      list[i].innerHTML = Math.floor(diff / 60) + 'm';
    } else if (diff < 86400) {
      list[i].innerHTML = Math.floor(diff / 3600) + 'h';
    } else {
      var date = new Date(time);
      list[i].innerHTML = date.getDate() + ' ' + months[date.getMonth()];
    }
  }
}

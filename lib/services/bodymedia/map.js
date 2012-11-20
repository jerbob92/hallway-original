function date(data) {
  if (!data.date) return;

  return new Date([
    data.date.substr(0,4),
    data.date.substr(4,2),
    data.date.substr(6,2)
  ].join('-')).getTime();
}

exports.sleepday = {
  id:'date',
  at: date
};

exports.stepday = {
  id:'date',
  at: date
};

exports.intensity = {
  id:'date',
  at: date
};

exports.minutes = {
  id:'date',
  at: date
};

exports.defaults = {
  self: 'profile',
  sleep: 'sleepday',
  steps: 'stepday',
  burn_intensity: 'intensity',
  burn_minutes: 'minutes'
};


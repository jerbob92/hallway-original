function dater(d)
{
  return new Date([d.substr(0,4),d.substr(4,2),d.substr(6,2)].join('-')).getTime();
}

exports.sleepday = {
  id:'date',
  at: function(data){ return data.date && dater(data.date) }
}

exports.stepday = {
  id:'date',
  at: function(data){ return data.date && dater(data.date) }
}

exports.intensity = {
  id:'date',
  at: function(data){ return data.date && dater(data.date) }
}

exports.minutes = {
  id:'date',
  at: function(data){ return data.date && dater(data.date) }
}

exports.defaults = {
  self: 'profile',
  sleep: 'sleepday',
  steps: 'stepday',
  burn_intensity: 'intensity',
  burn_minutes: 'minutes'
}


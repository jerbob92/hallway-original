/*
*
* Copyright (C) 2011, Singly, Inc.
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

exports.sync =
  require('./lib').dailySync('body/log/weight', 'weight', 'weight', 'weight', 'SCALE');

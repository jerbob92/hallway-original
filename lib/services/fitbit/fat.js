/*
*
* Copyright (C) 2011, Singly, Inc.
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

exports.sync =
  require('./lib').dailySync('body/log/fat', 'fat', 'fat', 'fat', 'SCALE');

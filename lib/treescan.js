/**
 * Shared utility functions for scanning directory trees.
 */

var dive = require('dive');

/**
 * Scans a directory tree for files.
 * @param {string} root Path to a root directory.
 * @param {RegExp=} opt_pathFilter A regular expression filter. If set, only
 *    paths matching the path_filter are returned.
 * @param {=} opt_ignoreHidden Defaults to `true`. If `true`, do not follow or
 *    return hidden directories or files (those starting with a '.' character).
 * @param {function(!Array.<string>)} callback
 */
var scanTree = function(root, opt_pathFilter, opt_ignoreHidden, callback) {
  var pathFilter = '';
  var ignoreHidden = true;

  if (typeof opt_pathFilter == 'function') {
    callback = opt_pathFilter;
  } else {
    pathFilter = opt_pathFilter;

    if (typeof opt_ignoreHidden == 'function') {
      callback = opt_ignoreHidden;
    } else {
      ignoreHidden = undefined === opt_ignoreHidden ? true : !!opt_ignoreHidden;
    }
  }

  var paths = [];

  dive(root, {
    all: !ignoreHidden
  }, function(err, file) {
    if (!err && (!pathFilter || pathFilter.test(file))) {
      paths.push(file);
    }
  }, function() {
    callback(paths);
  });
};

/**
 * Scans a directory tree for JavaScript files.
 * @param {string} root Path to a root directory.
 * @param {function(!Array.<string>)}
 * @return {!Array.<string>} List of JS files.
 */
exports.scanTreeForJsFiles = function(root, callback) {
  return scanTree(root, /^.+\.js$/, callback);
};

var async = require('async');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');

var Source = require('./source');
var treescan = require('./treescan');


/**
 * @param {Array.<string>} jsFiles
 * @param {Cache} cache
 * @param {function(Error,Array.<Source>)} callback
 */
exports.findSourcesByJsFiles = function(jsFiles, cache, callback) {
  var allSources = [];

  if (jsFiles && jsFiles.length) {
    var pathsMap = {};

    async.each(jsFiles, function(jsPath, callback) {
      jsPath = path.resolve(jsPath);

      var task = async.compose(
        function(files, callback) {
          exports.jsFilesToSources(files, cache, callback);
        },
        function(stats, callback) {
          exports.scanTreeForJsFiles(jsPath, stats, callback);
        },
        fs.stat
      );
      task(jsPath, function(err, sources) {
        if (!err) {
          sources.forEach(function(jsSource) {
            if (!pathsMap[jsSource.path]) {
              pathsMap[jsSource.path] = 1;
              allSources.push(jsSource);
            }
          });
        }

        callback(err);
      });
    }, function(err) {
      callback(err, allSources);
    });
  } else {
    callback(null, allSources);
  }
};

/**
 * @param {Array.<string>} files
 * @param {Cache} cache
 * @param {function(Error,Array.<Source>)} callback
 */
exports.jsFilesToSources = function(files, cache, callback) {
  try {
    var sources = [];

    files.forEach(function(jsPath) {
      var source;

      if (cache) {
        source = cache.getSource(jsPath);
      }

      if (!source) {
        source = Source.createFromFile(jsPath);

        if (cache) {
          cache.setSource(jsPath, source);
        }
      }

      sources.push(source);
    });
    callback(null, sources);
  } catch (e) {
    callback(e, null);
  }
};

/**
 * @param {string} jsPath
 * @param {fs.Stats} stats
 * @param {function(Error,Array.<string>)} callback
 */
exports.scanTreeForJsFiles = function(jsPath, stats, callback) {
  if (stats.isDirectory()) {
    treescan.scanTreeForJsFiles(jsPath, function(jsPaths) {
      callback(null, jsPaths);
    });
  } else {
    callback(null, [jsPath]);
  }
};


/**
 * @param {string} content
 * @param {string=} opt_filename If undefined then stdout.
 * @param {number|string=} opt_mode Octal permission for directory.
 *    Defaults to 0755.
 * @param {function(Error)=} opt_callback First argument is error or null.
 * @private
 */
exports.writeFile = function(content, opt_filename, opt_mode, opt_callback) {
  var filename = '';
  var callback;
  var mode = 0755;

  if (typeof opt_filename == 'string') {
    filename = opt_filename;

    if ('string' == typeof opt_mode || 'number' == typeof opt_mode) {
      mode = opt_mode;
    }
  } else if (typeof opt_mode == 'function') {
    callback = opt_mode;
  } else if (typeof opt_filename == 'function') {
    callback = opt_filename;
  }

  if (!callback) {
    callback = opt_callback || function() {};
  }

  if (filename) {
    mkdirp(path.dirname(filename), mode, function(err) {
      if (err) {
        callback(err);
      } else {
        fs.writeFile(filename, content, callback);
      }
    });
  } else {
    process.stdout.write(content);
    callback(null);
  }
};

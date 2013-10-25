var async = require('async');
var fs = require('fs');
var path = require('path');

var source = require('./source');
var treescan = require('./treescan');


/**
 * @param {Array.<string>} jsFiles
 * @param {function(Error,Array.<Source>)} callback
 */
exports.findSourcesByJsFiles = function(jsFiles, callback) {
  var allSources = [];

  if (jsFiles && jsFiles.length) {
    var pathsMap = {};

    async.each(jsFiles, function(jsPath, callback) {
      jsPath = path.resolve(jsPath);

      var task = async.compose(
        jsFilesToSources,
        function(stats, callback) {
          scanTreeForJsFiles(jsPath, stats, callback);
        },
        fs.stat
      );
      task(jsPath, function(err, sources) {
        if (!err) {
          sources.forEach(function(jsSource) {
            if (!pathsMap[jsSource.getPath()]) {
              pathsMap[jsSource.getPath()] = 1;
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
 * @param {function(Error,Array.<Source>)} callback
 */
var jsFilesToSources = exports.jsFilesToSources = function(files, callback) {
  try {
    var sources = [];

    files.forEach(function(jsPath) {
      var content = source.getFileContents(jsPath);

      if (content) {
        sources.push(new source.Source(jsPath, content));
      }
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
var scanTreeForJsFiles = exports.scanTreeForJsFiles = function(jsPath, stats,
    callback) {
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
 * @param {function(Error)=} opt_callback First argument is error or null.
 * @private
 */
exports.writeFile = function(content, opt_filename, opt_callback) {
  var filename = '';
  var callback;

  if (typeof opt_filename == 'string') {
    filename = opt_filename;
  } else if (typeof opt_filename == 'function') {
    callback = opt_filename;
  }

  if (!callback) {
    callback = opt_callback || function() {};
  }

  if (filename) {
    fs.writeFile(filename, content, callback);
  } else {
    process.stdout.write(content);
    callback(null);
  }
};

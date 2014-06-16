var async = require('async');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');

var Source = require('./source');


/**
 * @param {Array.<string>} files
 * @param {Cache} cache
 * @param {boolean=} opt_saveSyntaxTree
 * @return {Array.<Source>}
 */
var jsFilesToSources = function(files, cache, opt_saveSyntaxTree) {
  return files.map(function(jsPath) {
    var source = cache ? cache.getSource(jsPath) : null;

    if (!source) {
      source = Source.createFromFile(jsPath, opt_saveSyntaxTree);

      if (cache) {
        cache.setSource(jsPath, source);
      }
    }

    return source;
  });
};

/**
 * @param {Array.<string>} jsFiles
 * @param {Cache} cache
 * @param {boolean=} opt_saveSyntaxTree
 * @return {Array.<Source>}
 */
exports.findSourcesByJsFiles = function(jsFiles, cache, opt_saveSyntaxTree) {
  var allSources = [];

  if (jsFiles) {
    var pathsMap = {};

    jsFiles.forEach(function(jsPath) {
      jsPath = path.resolve(jsPath);

      var files = scanTreeForJsFiles(jsPath);
      var sources = jsFilesToSources(files, cache, opt_saveSyntaxTree);

      sources.forEach(function(jsSource) {
        if (!pathsMap[jsSource.path]) {
          pathsMap[jsSource.path] = 1;
          allSources.push(jsSource);
        }
      });
    });
  }

  return allSources;
};

/**
 * @param {string} jsPath
 * @return {Array.<string>}
 */
var scanTreeForJsFiles = function(jsPath) {
  return getFiles(jsPath).filter(function(jsPath) {
    return /^.+\.js$/.test(jsPath);
  });
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
    } else if (typeof opt_mode == 'function') {
      callback = opt_mode;
    }
  } else if (typeof opt_filename == 'function') {
    callback = opt_filename;
  }

  if (!callback) {
    callback = opt_callback || function() {};
  }

  if (filename) {
    mkdirp(path.dirname(filename), mode, function(err) {
      if (err) return callback(err);

      try {
        fs.writeFileSync(filename, content);
      } catch (e) {
        return callback(e);
      }

      callback(null);
    });
  } else {
    process.stdout.write(content);
    callback(null);
  }
};

/**
 * @param {string} file
 * @return {!Array.<string>}
 */
var getFiles = function(file) {
  var result = [];
  var stat = fs.statSync(file);

  if (stat && stat.isDirectory()) {
    var subFiles = fs.readdirSync(file);

    subFiles.forEach(function(subFile) {
      result = result.concat(getFiles(file + '/' + subFile));
    });
  } else {
    result.push(file);
  }

  return result;
};

var fs = require('fs');
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
 * @param {string=} filename
 * @param {function(Error)=} opt_callback First argument is error or null.
 * @private
 */
exports.writeFile = function(content, filename, opt_callback) {
  var callback = opt_callback || function() {};
  var mkdirp = require('mkdirp');

  mkdirp(path.dirname(filename), 0755, function(err) {
    if (!err) {
      try {
        fs.writeFileSync(filename, content);
      } catch (e) {
        err = e;
      }
    }

    callback(err);
  });
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

var async = require('async');
var path = require('path');

var Cache = require('./cache');
var time = require('./time');
var utils = require('./utils');


/**
 * @param {Array.<string>=} opt_jsFiles Paths to files or directories.
 * @param {string=} opt_baseDir
 * @param {string=} opt_prefix
 * @constructor
 */
var DepsWriter = module.exports = function(opt_jsFiles, opt_baseDir,
    opt_prefix) {
  /** @private {Cache} */
  this._cache = null;
  /** @private {boolean} */
  this._logPrint = true;
  /** @private {string} */
  this._outputFile = '';
  /** @private {Object.<Source>} */
  this._pathToSource = {};
  /** @type {Array.<DepsWriter.PreData>} */
  this._preData = [];

  if (opt_jsFiles) {
    this.addFiles(opt_jsFiles, opt_baseDir, opt_prefix);
  }
};


/**
 * @param {Object} options Fields:
 *    cacheFile (string) — path to cache file.
 *    files (Array.<string>) — files or directories to scan for JS source
 *      files. Paths of JS files in generated deps file will be relative
 *      to this path.
 *    filesWithDepsPath (Array.<string>) — a path to a source file and
 *      an alternate path to the file in the generated deps file (if either
 *      contains a space, surround with whitespace). This flag may be specified
 *      multiple times.
 *    filesWithPrefix (Array.<string>) — a root directory to scan for JS source
 *      files, plus a prefix (if either contains a space, surround with quotes).
 *      Paths in generated deps file will be relative to the root, but preceded
 *      by the prefix. This flag may be specified multiple times.
 *    logPrint (boolean) — print log in console. Defaults to true.
 *    outputFile (string) — if specified, write output to this path instead of
 *      writing to standard output.
 * @param {function(Error,string)=} opt_callback First argument is error or
 *    null. Second argument is content.
 */
DepsWriter.build = function(options, opt_callback) {
  var depsWriter = new DepsWriter();

  if (options.cacheFile) {
    depsWriter.setCacheFile(options.cacheFile);
  }

  if (options.files) {
    depsWriter.addFiles(files);
  }

  if (options.filesWithDepsPath) {
    options.filesWithDepsPath.forEach(function(fileWithDepPath) {
      var pair = getPair(fileWithDepPath);
      var jsFile = pair[0];
      var depPath = pair[1];
      depsWriter.addFileWithPath(jsFile, depPath);
    });
  }

  if (options.filesWithPrefix) {
    options.filesWithPrefix.forEach(function(fileWithPrefix) {
      var pair = getPair(fileWithPrefix);
      var jsFile = pair[0];
      var prefix = pair[1];
      depsWriter.addFiles([jsFile], '', prefix);
    });
  }

  if (options.outputFile) {
    depsWriter.setOutputFile(options.outputFile);
  }

  if (undefined !== options.logPrint) {
    depsWriter.setLogPrint(!!options.logPrint);
  }

  depsWriter.build(opt_callback);
};


/**
 * @typedef {{
 *  baseDir: string,
 *  jsFiles: Array.<string>,
 *  path: string,
 *  prefix: string
 * }}
 */
DepsWriter.PreData;

/**
 * Make a generated deps file.
 * @param {Object.<Source>} sourceMap A dict map of the source path
 *    to Source object.
 * @return {string} A generated deps file source.
 */
DepsWriter.makeDepsFile = function(sourceMap) {
  var paths = [];

  for (var path in sourceMap) {
    paths.push(path);
  }

  // Write in path alphabetical order
  paths.sort();

  var lines = [];

  paths.forEach(function(path) {
    // We don't need to add entries that don't provide anything.
    if (sourceMap[path].provides.length) {
      lines.push(DepsWriter.getDepsLine(path, sourceMap[path]));
    }
  });

  return lines.join('');
};

/**
 * Get a deps.js file string for a source.
 * @param {string} path
 * @param {Source} jsSource
 * @return {string}
 */
DepsWriter.getDepsLine = function(path, jsSource) {
  var provides = jsSource.provides.map(function(provide) {
    return "'" + provide + "'";
  });
  provides.sort();

  var requires = jsSource.requires.map(function(jsRequire) {
    return "'" + jsRequire + "'";
  });
  requires.sort();

  return "goog.addDependency('" + path + "', [" + provides.join(', ') + "], [" +
    requires.join(', ') + "]);\n";
};


/**
 * @return {Cache}
 */
DepsWriter.prototype.getCache = function() {
  return this._cache;
};

/**
 * @param {string} file
 */
DepsWriter.prototype.setCacheFile = function(file) {
  this._cache = new Cache(file);
};

/**
 * @param {string} jsFile Path to file.
 * @param {string} path
 */
DepsWriter.prototype.addFileWithPath = function(jsFile, path) {
  this._preData.push({
    baseDir: '',
    jsFiles: [jsFile],
    path: path,
    prefix: ''
  })
};

/**
 * @param {Array.<string>} jsFiles Paths to files or directories.
 * @param {string=} opt_baseDir
 * @param {string=} opt_prefix
 */
DepsWriter.prototype.addFiles = function(jsFiles, opt_baseDir, opt_prefix) {
  this._preData.push({
    baseDir: opt_baseDir || '',
    jsFiles: jsFiles,
    path: '',
    prefix: opt_prefix || ''
  })
};

/**
 * @return {boolean}
 */
DepsWriter.prototype.isLogPrint = function() {
  return this._logPrint;
};

/**
 * @param {boolean} enable
 */
DepsWriter.prototype.setLogPrint = function(enable) {
  this._logPrint = enable;
};

/**
 * @return {string}
 */
DepsWriter.prototype.getOutputFile = function() {
  return this._outputFile;
};

/**
 * @param {string} jsFile
 */
DepsWriter.prototype.setOutputFile = function(jsFile) {
  this._outputFile = jsFile;
};

/**
 * @param {Array.<DepsWriter.PreData>} preData
 * @param {function(Error,Object.<Source>)} callback
 * @private
 */
DepsWriter.prototype._getSourcesMap = function(preData, callback) {
  time.tick('Search sources by JS files');

  /** @type {Object.<Source>} */
  var pathToSource = {};
  var cache = this._cache;

  async.eachSeries(preData, function(item, callback) {
    var baseDir = item.baseDir ? path.resolve(item.baseDir) : __dirname;

    utils.findSourcesByJsFiles(item.jsFiles, cache, function(err, jsSources) {
      if (!err) {
        if (cache) {
          try {
            cache.save(function(err) {
              if (err) {
                console.error(err);
              }
            });
          } catch (e) {
            console.error(e);
          }
        }

        jsSources.forEach(function(jsSource) {
          if (item.path) {
            pathToSource[item.path] = jsSource;
          } else {
            var depPath = item.prefix + path.relative(baseDir, jsSource.path);
            pathToSource[depPath] = jsSource;
          }
        });
      }

      callback(err);
    });
  }, function(err) {
    callback(err, pathToSource);
  });
};

/**
 * @param {function(Error,string)=} opt_callback First argument is error or
 *    null. Second argument is content.
 */
DepsWriter.prototype.build = function(opt_callback) {
  time.start(this._logPrint);

  async.compose(
    this._write.bind(this),
    this._getSourcesMap.bind(this)
  )(this._preData, function(err, content) {
    time.total('Total time. Deps generated');

    if (opt_callback) {
      opt_callback(err, content);
    }
  });
};

/**
 * @param {Object.<Source>} pathToSource
 * @param {function(Error,string)} callback
 * @private
 */
DepsWriter.prototype._write = function(pathToSource, callback) {
  time.tick('Generate deps')

  var content = '// This file was autogenerated by ' + __filename +
    '.\n// Please do not edit.\n' + DepsWriter.makeDepsFile(pathToSource);

  if (this._outputFile) {
    utils.writeFile(content, this._outputFile || '', function(err) {
      callback(err, content);
    });
  } else {
    callback(null, content);
  }
};


/**
 * Return a string as a shell-parsed tuple. Two values expected.
 * @param {string} s
 * @return {!Array.<string>}
 */
var getPair = function(s) {
  return s.replace('\\', '\\\\').split(' ');
};

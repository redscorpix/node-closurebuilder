var async = require('async');
var fs = require('fs');
var inherits = require('util').inherits;
var path = require('path');

var BuilderBase = require('./builderbase');
var Cache = require('./cache');
var JsModule = require('./jsmodule');
var time = require('./time');
var utils = require('./utils');


/**
 * @param {string} compilerPath
 * @param {string} inputs Files or directories.
 * @param {Array.<string>} jsFiles Files or directories.
 * @param {string=} opt_cacheFile
 * @constructor
 * @extends {BuilderBase}
 */
var Builder = module.exports = function(compilerPath, inputs, jsFiles,
    opt_cacheFile) {
  BuilderBase.call(this, compilerPath);

  /** @private {Cache} */
  this._cache = opt_cacheFile ? new Cache(opt_cacheFile) : null;
  /** @type {Array<string>} */
  this.compilerArgs = null;
  /** @type {Array.<string>} */
  this.inputs = inputs;
  /** @type {Array.<string>} */
  this.jsFiles = jsFiles;
  /** @private {string} */
  this._outputPath = '';
  /** @type {string} */
  this.sourceMapPath = '';
};
inherits(Builder, BuilderBase);


/**
 * @param {string} compilerPath
 * @param {Array.<string>} inputs Files or directories.
 * @param {Array.<string>} jsFiles Files or directories.
 * @param {Object=} opt_options Fields:
 *    cacheFile (string) — path to cache file.
 *    compilerFlags (Array.<string>) — additional flags to pass to the Closure
 *      compiler.
 *    defines (Object.<boolean|number|string>) — defines for Closure compiler.
 *    externs (Array.<string>) — externs for Closure compiler.
 *    jvmFlags (Array.<string>) — additional flags to pass to the JVM compiler.
 *    logLevel (BuilderBase.LogLevel) — print log in console.
 *      Defaults to BuilderBase.LogLevel.SHORT.
 *    maxBuffer (number) — in bytes. Defaults to 200 * 1024.
 *    outputFile (string) — if specified, write output to this path instead of
 *      writing to standard output.
 *    sourceMapPath (string) — path to generated source map.
 *    compilerArgs (Array<string>) — additional compiler arguments.
 * @param {function(Error,string)=} opt_callback First argument is error or
 *    null. Second argument is data.
 */
Builder.compile = function(compilerPath, inputs, jsFiles, opt_options,
    opt_callback) {
  var options;
  var callback;

  if ('function' == typeof opt_options) {
    callback = opt_options;
  } else {
    if ('object' == typeof opt_options) {
      options = opt_options;
    }

    if ('function' == typeof opt_callback) {
      callback = opt_callback;
    }
  }

  var cacheFile = '';

  if (options && options.cacheFile) {
    cacheFile = options.cacheFile;
  }

  var builder = new Builder(compilerPath, inputs, jsFiles, cacheFile);

  if (options) {
    builder.setCompilerFlags(options.compilerFlags || null);
    builder.setDefinesMap(options.defines || null);
    builder.setExterns(options.externs || null);
    builder.setJvmFlags(options.jvmFlags || null);

    if (undefined !== options.logLevel) {
      builder.setLogLevel(options.logLevel);
    }

    if (options.maxBuffer) {
      builder.setMaxBuffer(options.maxBuffer);
    }

    if (options.outputFile) {
      builder.setOutputPath(options.outputFile);
    }

    if (options.sourceMapPath) {
      builder.sourceMapPath = options.sourceMapPath;
    }

    if (options.compilerArgs) {
      builder.compilerArgs = options.compilerArgs;
    }
  }

  builder.compile(callback);
};


/**
 * @return {Cache}
 */
Builder.prototype.getCache = function() {
  return this._cache;
};



/**
 * @return {string}
 */
Builder.prototype.getOutputPath = function() {
  return this._outputPath;
};

/**
 * @param {string} outputPath
 */
Builder.prototype.setOutputPath = function(outputPath) {
  this._outputPath = outputPath;
};

/**
 * @param {function(Error,string)=} opt_callback First argument is error or
 *    null. Second argument is data.
 */
Builder.prototype.compile = function(opt_callback) {
  time.start(!!this.getLogLevel());

  var cache = this._cache;
  var inputs = this.inputs;
  var inputSources;
  var jsSources;

  time.tick('Scanning paths...');

  async.compose(
    this._compile.bind(this),
    function(callback) {
      var rootModule = new JsModule('main', null, jsSources, inputSources);
      rootModule.build(function(err) {
        callback(err, rootModule);
      });
    },
    function(sources, callback) {
      if (cache) {
        try {
          cache.save(function(err) {
            if (err) console.error(err);
          });
        } catch (e) {
          console.error(e);
        }
      }

      inputSources = sources;
      time.tick((jsSources.length + inputSources.length) + ' sources scanned.');

      // Though deps output doesn't need to query the tree, we still build it
      // to validate dependencies.
      time.tick('Building dependency tree...');
      callback(null);
    },
    function(jsFiles, callback) {
      var sources;

      try {
        sources = utils.findSourcesByJsFiles(jsFiles, cache);
      } catch (e) {
        return callback(e);
      }

      callback(null, sources);
    },
    function(sources, callback) {
      jsSources = sources;
      callback(null, inputs);
    },
    function(jsFiles, callback) {
      var sources;

      try {
        sources = utils.findSourcesByJsFiles(jsFiles, cache);
      } catch (e) {
        return callback(e);
      }

      callback(null, sources);
    }
  )(this.jsFiles, function(err, data) {
    if (opt_callback) {
      opt_callback(err, err ? '' : data);
    }
  });
};

/**
 * @param {JsModule} rootModule
 * @param {function(Error,string)} callback First argument is error or null.
 *    Second argument is data.
 * @private
 */
Builder.prototype._compile = function(rootModule, callback) {
  /** @type {function(Error,string)} */
  var onCompileComplete = function(err, compiledSource) {
    if (err) return callback(err);

    time.total('Total time. JavaScript compilation succeeded.');
    this._finish(compiledSource, callback);
  };
  this.runCompiler(rootModule, onCompileComplete.bind(this));
};

/**
 * @param {string} content
 * @param {function(Error,string)} callback First argument is error or null.
 *    Second argument is data.
 * @private
 */
Builder.prototype._finish = function(content, callback) {
  if (this._outputPath) {
    utils.writeFile(content, this._outputPath, function(err) {
      callback(err, content);
    });
  } else {
    callback(null, content);
  }
};

/** @inheritDoc */
Builder.prototype.getArgs = function(rootModule, callback) {
  var self = this;
  var appendArgs = function(err, javaArgs, compilerArgs) {
    if (err) return callback(err);

    if (self.sourceMapPath) {
      compilerArgs.push('--create_source_map "%outname%.map"');
      compilerArgs.push('--output_wrapper "%output%\n//# sourceMappingURL=%outname%.map"');
    }

    if (self.compilerArgs) {
      compilerArgs = compilerArgs.concat(self.compilerArgs);
    }

    callback(null, javaArgs, compilerArgs);
  };

  BuilderBase.prototype.getArgs.call(this, rootModule, appendArgs);
};

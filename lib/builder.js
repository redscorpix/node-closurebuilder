var async = require('async');
var fs = require('fs');
var inherits = require('util').inherits;
var path = require('path');

var BuilderBase = require('./builderbase').BuilderBase;
var JsModule = require('./js_module').JsModule;
var time = require('./time');
var utils = require('./utils');


/**
 * @param {string} compilerPath
 * @param {string} inputs Files or directories.
 * @param {Array.<string>} jsFiles Files or directories.
 * @constructor
 * @extends {BuilderBase}
 */
var Builder = exports.Builder = function(compilerPath, inputs, jsFiles) {
  BuilderBase.call(this, compilerPath);

  /** @type {Array.<string>} */
  this.inputs = inputs;
  /** @type {Array.<string>} */
  this.jsFiles = jsFiles;
};
inherits(Builder, BuilderBase);


/**
 * @private {boolean}
 */
Builder.prototype._logPrint = true;

/**
 * @private {string}
 */
Builder.prototype._outputPath = '';


/**
 * @return {boolean}
 */
Builder.prototype.isLogPrint = function() {
  return this._logPrint;
};

/**
 * @param {boolean} enable
 */
Builder.prototype.setLogPrint = function(enable) {
  this._logPrint = enable;
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
  time.start(this._logPrint);

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
      inputSources = sources;
      time.tick((jsSources.length + inputSources.length) + ' sources scanned.');

      // Though deps output doesn't need to query the tree, we still build it
      // to validate dependencies.
      time.tick('Building dependency tree...');
      callback(null);
    },
    utils.findSourcesByJsFiles,
    function(sources, callback) {
      jsSources = sources;
      callback(null, inputs);
    },
    utils.findSourcesByJsFiles
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
    if (err) {
      callback(err, '');
    } else {
      time.total('Total time. JavaScript compilation succeeded.');

      this._finish(compiledSource, callback);
    }
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


/**
 * @param {string} compilerPath
 * @param {Array.<string>} inputs Files or directories.
 * @param {Array.<string>} jsFiles Files or directories.
 * @param {Object=} opt_options Fields:
 *    compilerFlags (Array.<string>) — additional flags to pass to the Closure
 *      compiler.
 *    defines (Object.<boolean|number|string>) — defines for Closure compiler.
 *    externs (Array.<string>) — externs for Closure compiler.
 *    jvmFlags (Array.<string>) — additional flags to pass to the JVM compiler.
 *    logPrint (boolean) — print log in console. Defaults to true.
 *    maxBuffer (number) — in bytes. Defaults to 200 * 1024.
 *    outputFile (string) — if specified, write output to this path instead of
 *      writing to standard output.
 * @param {function(Error,string)=} opt_callback First argument is error or
 *    null. Second argument is data.
 */
exports.compile = function(compilerPath, inputs, jsFiles, opt_options,
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

  var builder = new Builder(compilerPath, inputs, jsFiles);

  if (options) {
    builder.setCompilerFlags(options.compilerFlags || null);
    builder.setDefinesMap(options.defines || null);
    builder.setExterns(options.externs || null);
    builder.setJvmFlags(options.jvmFlags || null);

    if (undefined !== options.logPrint) {
      builder.setLogPrint(!!options.logPrint);
    }

    if (options.maxBuffer) {
      builder.setMaxBuffer(options.maxBuffer);
    }

    if (options.outputFile) {
      builder.setOutputPath(options.outputFile);
    }
  }

  builder.compile(callback);
};

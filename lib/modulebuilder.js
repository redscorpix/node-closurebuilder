var inherits = require('util').inherits;

var BuilderBase = require('./builderbase');
var Cache = require('./cache');
var ModuleParser = require('./moduleparser');


/**
 * @param {string} compilerPath
 * @param {Object|string} config JSON or path to file.
 * @param {Array.<string>} jsFiles Files or directories.
 * @param {string=} opt_cacheFile
 * @constructor
 * @extends {BuilderBase}
 */
var ModuleBuilder = module.exports = function(compilerPath, config, jsFiles,
    opt_cacheFile) {
  BuilderBase.call(this, compilerPath);

  /** @private {Cache} */
  this._cache = opt_cacheFile ? new Cache(opt_cacheFile) : null;
  /** @private {ModuleParser} */
  this._parser = new ModuleParser(config, jsFiles, this._cache);
  /** @type {string} */
  this.sourceMapPath = '';
  /** @type {Array<string>} */
  this.compilerArgs = null;
  /** @type {Array<Object>} */
  this._modulesInfo = null;
};
inherits(ModuleBuilder, BuilderBase);


/**
 * @const {string}
 */
ModuleBuilder.MODULE_WRAPPER =
    '%source%\n' +
    '//# sourceURL=%productionUri%%name%.js\n' +
    '//# sourceMappingURL=%productionUri%%name%.js.map';

/**
 * @const {string}
 */
ModuleBuilder.MODULE_WRAPPER_WITH_SCOPE =
    '(function(%renamePrefixNamespace%){%source%})(%globalScopeName%);\n' +
    '//# sourceURL=%productionUri%%name%.js\n' +
    '//# sourceMappingURL=%productionUri%%name%.js.map';

/**
 * @const {string}
 */
ModuleBuilder.ROOT_MODULE_WRAPPER =
    'MODULE_INFO=%moduleInfo%;\n' +
    'MODULE_URIS=%moduleUris%;\n' +
    'MODULE_USE_DEBUG_MODE=false;\n' +
    '%source%\n' +
    '//# sourceMappingURL=%productionUri%%name%.js.map';

/**
 * @const {string}
 */
ModuleBuilder.ROOT_MODULE_WRAPPER_WITH_SCOPE =
    'MODULE_INFO=%moduleInfo%;\n' +
    'MODULE_URIS=%moduleUris%;\n' +
    'MODULE_USE_DEBUG_MODE=false;\n' +
    '%globalScopeName%={};\n'+
    '(function(%renamePrefixNamespace%){%source%})(%globalScopeName%);\n' +
    '//# sourceMappingURL=%productionUri%%name%.js.map';


/**
 * @param {string} compilerPath
 * @param {Object|string} config JSON or path to file.
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
 *    sourceMapPath (string) — path to generated source map.
 *    compilerArgs (Array<string>) — additional compiler arguments.
 * @param {function(Error)=} opt_callback First argument is error or null.
 */
ModuleBuilder.compile = function(compilerPath, config, jsFiles, opt_options,
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

  var builder = new ModuleBuilder(compilerPath, config, jsFiles, cacheFile);

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
 * @param {ModuleBuilder} builder
 * @param {JsModule} module
 * @return {string}
 */
ModuleBuilder.getModuleWrapperValue = function(builder, module) {
  var parent = module.getParent();

  if (builder.getParser().globalScopeName) {
    return parent ?
      ModuleBuilder.MODULE_WRAPPER_WITH_SCOPE :
      ModuleBuilder.ROOT_MODULE_WRAPPER_WITH_SCOPE;
  } else {
    return parent ?
      ModuleBuilder.MODULE_WRAPPER : ModuleBuilder.ROOT_MODULE_WRAPPER;
  }
};


/**
 * @return {Cache}
 */
ModuleBuilder.prototype.getCache = function() {
  return this._cache;
};

/**
 * @param {JsModule} module
 * @return {string}
 * @private
 */
ModuleBuilder.prototype._getModuleWrapperValue = function(module) {
  var jsonModuleInfo = JSON.stringify(this._parser.getJsonModuleInfo());
  var jsonModuleUris = JSON.stringify(this._parser.getJsonModuleUris());
  var wrapper = module.getWrapper();

  if (!wrapper) {
    wrapper = ModuleBuilder.getModuleWrapperValue(this, module);
  } else if ('function' == typeof wrapper) {
    wrapper = wrapper(this, module);
  }

  var value = wrapper.
    replace(/%globalScopeName%/g, this._parser.globalScopeName).
    replace(/%moduleInfo%/g, jsonModuleInfo.replace(/"/g, '\\"')).
    replace(/%moduleUris%/g, jsonModuleUris.replace(/"/g, '\\"')).
    replace(/%name%/g, module.name).
    replace(/%productionUri%/g, this._parser.productionUri).
    replace(/%renamePrefixNamespace%/g, this._parser.renamePrefixNamespace).
    replace(/%source%/g, '%s');

  return module.name + ':"' + value + '"';
};

/**
 * @param {JsModule} module
 * @return {!Array.<Object>}
 * @private
 */
ModuleBuilder.prototype._getModulesInfo = function(module) {
  var result = [{
    name: module.getModuleFlagValue(),
    wrapper: this._getModuleWrapperValue(module)
  }];

  module.getSubModules().forEach(function(subModule) {
    result = result.concat(this._getModulesInfo(subModule));
  }, this);

  return result;
};

/**
 * @return {ModuleParser}
 */
ModuleBuilder.prototype.getParser = function() {
  return this._parser;
};

/**
 * @param {function(Error,string)=} opt_callback First argument is error
 *    or null. Second argument is the compiled source, as a string, or empty
 *    string if compilation failed.
 */
ModuleBuilder.prototype.compile = function(opt_callback) {
  var callback = opt_callback || function() {};
  var self = this;
  this._parser.parse(function(err, rootModule) {
    if (err) return callback(err);

    if (self._cache) {
      self._cache.save();
    }

    self.runCompiler(rootModule, callback);
  });
};

/** @inheritDoc */
ModuleBuilder.prototype.getArgs = function(rootModule, callback) {
  var f = function(err, javaArgs, compilerArgs) {
    if (err) return callback(err, javaArgs, compilerArgs);

    this._modulesInfo = this._getModulesInfo(rootModule);
    this._modulesInfo.forEach(function(jsModule, i) {
      compilerArgs.push('--module ' + jsModule.name);
      compilerArgs.push('--module_wrapper ' + jsModule.wrapper);
    });

    if (this._parser.outputPathPrefix) {
      compilerArgs.push('--module_output_path_prefix "' +
        this._parser.outputPathPrefix + '"');
    }

    if (this.sourceMapPath) {
      compilerArgs.push('--create_source_map "%outname%.map"');
      compilerArgs.push('--output_wrapper "%output%\n//# sourceMappingURL=%outname%.map"');
    }

    if (this.compilerArgs) {
      compilerArgs = compilerArgs.concat(this.compilerArgs);
    }

    callback(null, javaArgs, compilerArgs);
  };
  BuilderBase.prototype.getArgs.call(this, rootModule, f.bind(this));
};

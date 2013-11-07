var async = require('async');
var inherits = require('util').inherits;

var BuilderBase = require('./builderbase').BuilderBase;
var ModuleParser = require('./moduleparser').ModuleParser;


/**
 * @param {string} compilerPath
 * @param {Object|string} config JSON or path to file.
 * @param {Array.<string>} jsFiles Files or directories.
 * @constructor
 * @extends {BuilderBase}
 */
var ModuleBuilder = exports.ModuleBuilder = function(compilerPath, config,
    jsFiles) {
  BuilderBase.call(this, compilerPath);

  /** @private {ModuleParser} */
  this._parser = new ModuleParser(config, jsFiles);
};
inherits(ModuleBuilder, BuilderBase);


/**
 * @const {string}
 */
ModuleBuilder.MODULE_WRAPPER =
  '%source%\n' +
  '//@ sourceURL=%productionUri%%name%.js';

/**
 * @const {string}
 */
ModuleBuilder.MODULE_WRAPPER_WITH_SCOPE =
  '(function(%renamePrefixNamespace%){%source%})(%globalScopeName%);\n' +
  '//@ sourceURL=%productionUri%%name%.js';

/**
 * @const {string}
 */
ModuleBuilder.ROOT_MODULE_WRAPPER =
  'MODULE_INFO=%moduleInfo%;\n' +
  'MODULE_URIS=%moduleUris%;\n' +
  'MODULE_USE_DEBUG_MODE=false;\n' +
  '%source%';

/**
 * @const {string}
 */
ModuleBuilder.ROOT_MODULE_WRAPPER_WITH_SCOPE =
  'MODULE_INFO=%moduleInfo%;\n' +
  'MODULE_URIS=%moduleUris%;\n' +
  'MODULE_USE_DEBUG_MODE=false;\n' +
  '%globalScopeName%={};\n'+
  '(function(%renamePrefixNamespace%){%source%})(%globalScopeName%);';


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
 * @private {boolean}
 */
ModuleBuilder.prototype._logPrint = true;


/**
 * @return {boolean}
 */
ModuleBuilder.prototype.isLogPrint = function() {
  return this._logPrint;
};

/**
 * @param {boolean} enable
 */
ModuleBuilder.prototype.setLogPrint = function(enable) {
  this._logPrint = enable;
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
 * @param {function(Error)=} opt_callback First argument is error or null.
 */
ModuleBuilder.prototype.compile = function(opt_callback) {
  var parse = function(emptyData, callback) {
    this._parser.parse(callback);
  };

  async.compose(
    this.runCompiler.bind(this),
    parse.bind(this)
  )(null, function(err, source) {
    if (opt_callback) {
      opt_callback(err);
    }
  });
};

/** @inheritDoc */
ModuleBuilder.prototype.getArgs = function(rootModule, callback) {
  var f = function(err, args) {
    if (!err) {
      /** @type {!Array.<Object>} */
      var modules = this._getModulesInfo(rootModule);

      modules.forEach(function(jsModule, i) {
        args.push('--module ' + jsModule.name);
        args.push('--module_wrapper ' + jsModule.wrapper);
      });

      if (this._parser.outputPathPrefix) {
        args.push("--module_output_path_prefix '" +
          this._parser.outputPathPrefix + "'");
      }
    }

    callback(err, args);
  };
  BuilderBase.prototype.getArgs.call(this, rootModule, f.bind(this));
};

/**
 * @param {string} compilerPath
 * @param {Object|string} config JSON or path to file.
 * @param {Array.<string>} jsFiles Files or directories.
 * @param {Object=} opt_options Fields:
 *    compilerFlags (Array.<string>) — additional flags to pass to the Closure
 *      compiler.
 *    defines (Object.<boolean|number|string>) — defines for Closure compiler.
 *    externs (Array.<string>) — externs for Closure compiler.
 *    jvmFlags (Array.<string>) — additional flags to pass to the JVM compiler.
 *    logPrint (boolean) — print log in console. Defaults to true.
 *    maxBuffer (number) — in bytes. Defaults to 200 * 1024.
 * @param {function(Error)=} opt_callback First argument is error or null.
 */
exports.compile = function(compilerPath, config, jsFiles, opt_options,
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

  var builder = new ModuleBuilder(compilerPath, config, jsFiles);

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
  }

  builder.compile(callback);
};

var async = require('async');
var fs = require('fs');
var inherits = require('util').inherits;
var path = require('path');

var BuilderBase = require('./builderbase').BuilderBase;
var JsCompiler = require('./jscompiler').JsCompiler;
var JsModule = require('./js_module').JsModule;
var time = require('./time');
var utils = require('./utils');


/**
 * @param {string} compilerPath
 * @param {Object|string} config JSON or path to file.
 * @param {Array.<string>} jsFiles Files or directories.
 * @constructor
 */
var ModuleBuilder = exports.ModuleBuilder = function(compilerPath, config,
    jsFiles) {
  BuilderBase.call(this, compilerPath);

  var configFile = '';
  var configJson = null;

  if ('string' == typeof config) {
    configFile = config;
  } else if (config) {
    configJson = config;
  }

  /** @private {Object} */
  this._config = configJson;
  /** @private {string} */
  this._configFile = configFile;
  /** @type {Array.<string>} */
  this.jsFiles = jsFiles;
};
inherits(ModuleBuilder, BuilderBase);


/**
 * @const {string}
 */
ModuleBuilder.MODULE_WRAPPER =
  '%source\n' +
  '//@ sourceURL=%productionUri%name.js';

/**
 * @const {string}
 */
ModuleBuilder.MODULE_WRAPPER_WITH_SCOPE =
  '(function(%renamePrefixNamespace){%source})(%globalScopeName);\n' +
  '//@ sourceURL=%productionUri%name.js';

/**
 * @const {string}
 */
ModuleBuilder.ROOT_MODULE_WRAPPER =
  'MODULE_INFO=%moduleInfo;\n' +
  'MODULE_URIS=%moduleUris;\n' +
  'MODULE_USE_DEBUG_MODE=false;\n' +
  '%source';

/**
 * @const {string}
 */
ModuleBuilder.ROOT_MODULE_WRAPPER_WITH_SCOPE =
  'MODULE_INFO=%moduleInfo;\n' +
  'MODULE_URIS=%moduleUris;\n' +
  'MODULE_USE_DEBUG_MODE=false;\n' +
  '%globalScopeName={};\n'+
  '(function(%renamePrefixNamespace){%source})(%globalScopeName);';

/**
 * @typedef {{
 *  deps: !Array.<string>,
 *  inputs: !Array.<string>,
 *  wrapper: string
 * }}
 */
ModuleBuilder.RawModule;


/**
 * @param {string} configFile
 * @param {function(Error,Object)} First argument is error or null.
 */
ModuleBuilder.readConfigFile = function(configFile, callback) {
  async.compose(
    function(fileContent, callback) {
      try {
        var configJson = JSON.parse(fileContent);

        if ('object' == typeof configJson) {
          callback(null, configJson);
        } else {
          callback(new Error('Wrong config file.'), null);
        }
      } catch (e) {
        callback(e, null);
      }
    },
    function(configFile, callback) {
      fs.readFile(configFile, 'utf8', callback);
    }
  )(configFile, callback);
};

/**
 * @param {string} name Module id.
 * @param {JsModule?} parent
 * @param {Object.<RawModule>} rawModules
 * @param {Object.<Array.<string>>} childsMap
 * @param {Array.<Source>} jsSources
 * @param {function(Error,JsModule)} callback
 */
ModuleBuilder.getJsModule = function(name, parent, rawModules, childsMap,
    jsSources, callback) {
  /** @type {RawModule} */
  var rawModule = rawModules[name];

  async.compose(
    function(inputSources, callback) {
      var sources = jsSources.map(function(jsSource) {
        return jsSource;
      });
      var jsModule = new JsModule(name, parent, sources, inputSources);

      if (rawModule.wrapper) {
        jsModule.setWrapper(rawModule.wrapper);
      }

      if (childsMap[name]) {
        async.map(childsMap[name], function(subName, callback) {
          ModuleBuilder.getJsModule(
            subName, jsModule, rawModules, childsMap, jsSources, callback);
        }, function(err, subModules) {
          if (!err) {
            subModules.forEach(function(subModule) {
              jsModule.addSubModule(subModule);
            });
          }

          callback(err, jsModule);
        });
      } else {
        callback(null, jsModule);
      }
    },
    utils.findSourcesByJsFiles
  )(rawModule.inputs, callback);
};

/**
 * @param {JsModule} module
 * @return {Array.<string>}
 */
ModuleBuilder.getJsonModuleInfo = function(module) {
  /** @type {JsModule} */
  var parent = module.getParent();
  var parentName = parent ? '\\"' + parent.name + '\\"' : '';
  var result = ['\\"' + module.name + '\\":[' + parentName + ']'];

  module.getSubModules().forEach(function(subModule) {
    result = result.concat(ModuleBuilder.getJsonModuleInfo(subModule));
  });

  return result;
};

/**
 * @param {JsModule} module
 * @param {string} productionUriPrefix
 * @return {Array.<string>}
 */
ModuleBuilder.getJsonModuleUris = function(module, productionUriPrefix) {
  var result = ['\\"' + module.name + '\\":\\"' + productionUriPrefix +
    module.name + '.js\\"'];

  module.getSubModules().forEach(function(subModule) {
    result = result.concat(
      ModuleBuilder.getJsonModuleUris(subModule, productionUriPrefix));
  });

  return result;
};

/**
 * @param {ModuleBuilder} builder
 * @param {JsModule} module
 * @return {string}
 */
ModuleBuilder.getModuleWrapperValue = function(builder, module) {
  var parent = module.getParent();

  if (builder.globalScopeName) {
    return parent ?
      ModuleBuilder.MODULE_WRAPPER_WITH_SCOPE :
      ModuleBuilder.ROOT_MODULE_WRAPPER_WITH_SCOPE;
  } else {
    return parent ?
      ModuleBuilder.MODULE_WRAPPER : ModuleBuilder.ROOT_MODULE_WRAPPER;
  }
};


/**
 * @type {string}
 */
ModuleBuilder.prototype.globalScopeName = '';

/**
 * @private {boolean}
 */
ModuleBuilder.prototype._logPrint = true;

/**
 * @type {string}
 */
ModuleBuilder.prototype.outputPathPrefix = '';

/**
 * @type {string}
 */
ModuleBuilder.prototype.productionUri = '';

/**
 * @type {string}
 */
ModuleBuilder.prototype.renamePrefixNamespace = 'z';

/**
 * @private {function(Error)}
 */
ModuleBuilder.prototype._callback = null;


/**
 * @param {Error=} opt_error
 * @private
 */
ModuleBuilder.prototype._runCallback = function(opt_error) {
  if (this._callback) {
    this._callback(opt_error || null);
  }
};

/**
 * @param {Object} configJson
 * @private
 */
ModuleBuilder.prototype._parseCofig = function(configJson) {
  async.compose(
    this._compile.bind(this),
    function(rootModule, callback) {
      rootModule.build(function(err) {
        callback(err, rootModule);
      });
    },
    this._getJsModules.bind(this),
    this._getRawModules.bind(this),
    this._getGlobalOptions.bind(this)
  )(configJson, this._runCallback.bind(this));
};

/**
 * @param {Object} configJson
 * @param {function(Error,Object)} callback
 * @private
 */
ModuleBuilder.prototype._getGlobalOptions = function(configJson, callback) {
  var name = configJson.globalScopeName;
  var outputPathPrefix = configJson.outputPath;
  var productionUri = configJson.productionUri;
  var renamePrefixNamespace = configJson.renamePrefixNamespace;
  var errorMessage = '';

  if (name && 'string' != typeof name) {
    errorMessage = 'Wrong scope name.';
  } else if (!(outputPathPrefix && 'string' == typeof outputPathPrefix)) {
    errorMessage = 'Empty output path.';
  } else if (!(productionUri && 'string' == typeof productionUri)) {
    errorMessage = 'Empty production uri.';
  } else if (renamePrefixNamespace && 'string' != typeof renamePrefixNamespace) {
    errorMessage = "Wrong field 'renamePrefixNamespace'.";
  }

  if (errorMessage) {
    callback(new Error(errorMessage), null);
  } else {
    this.outputPathPrefix = path.resolve(this._configFile, outputPathPrefix);
    this.productionUri = productionUri;

    if (name) {
      this.globalScopeName = name;
    }

    if (renamePrefixNamespace) {
      this.renamePrefixNamespace = renamePrefixNamespace;
    }

    callback(null, configJson);
  }
};

/**
 * @param {Object.<ModuleBuilder.RawModule>} rawModules
 * @param {function(Error,Array.<JsModule>)} callback
 * @private
 */
ModuleBuilder.prototype._getJsModules = function(rawModules, callback) {
  var rootName = '';
  var childsMap = {};

  for (var name in rawModules) {
    if (rawModules[name].deps.length) {
      rawModules[name].deps.forEach(function(depName) {
        if (!childsMap[depName]) {
          childsMap[depName] = [];
        }

        childsMap[depName].push(name);
      });
    } else {
      if (rootName) {
        callback(new Error('Only one root module should be.'));

        return;
      } else {
        rootName = name;
      }
    }
  }

  if (rootName) {
    utils.findSourcesByJsFiles(this.jsFiles, function(err, jsSources) {
      if (err) {
        callback(err, null);
      } else {
        ModuleBuilder.getJsModule(
          rootName, null, rawModules, childsMap, jsSources, callback);
      }
    });
  } else {
    callback(new Error('Root module not found.'));
  }
};

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
  var productionUri = this.productionUri;
  var replaceModuleInfo = function(str) {
    return '{' + ModuleBuilder.getJsonModuleInfo(module).join(',') + '}';
  };
  var replaceModuleUris = function(str) {
    return '{' +
      ModuleBuilder.getJsonModuleUris(module, productionUri).join(',') + '}';
  };
  var wrapper = module.getWrapper();

  if (!wrapper) {
    wrapper = ModuleBuilder.getModuleWrapperValue(this, module);
  } else if ('function' == typeof wrapper) {
    wrapper = wrapper(this, module);
  }

  var value = wrapper.
    replace(/%globalScopeName/g, this.globalScopeName).
    replace(/%moduleInfo/g, replaceModuleInfo).
    replace(/%moduleUris/g, replaceModuleUris).
    replace(/%name/g, module.name).
    replace(/%productionUri/g, this.productionUri).
    replace(/%renamePrefixNamespace/g, this.renamePrefixNamespace).
    replace(/%source/g, '%s');

  return module.name + ':"' + value + '"';
};

/**
 * @param {JsModule} module
 * @return {!Array.<JsCompiler.Module>}
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
 * @param {Object} json
 * @param {function(Error,Object.<ModuleBuilder.RawModule>)} callback
 * @private
 */
ModuleBuilder.prototype._getRawModules = function(json, callback) {
  var jsonModules = json['modules'];

  if (!jsonModules) {
    callback(new Error('Modules not found.'), null);

    return;
  }

  var rawModules = {};

  for (var name in jsonModules) {
    if ('object' != typeof jsonModules[name]) {
      callback(new Error("Module '" + name + "' has not info."), null);

      return;
    }

    var deps = jsonModules[name].deps;
    var inputs = jsonModules[name].inputs;
    var wrapper = jsonModules[name].wrapper;

    if ('string' == typeof deps && deps) {
      deps = [deps];
    } else if (!Array.isArray(deps)) {
      deps = [];
    }

    if ('string' == typeof inputs && inputs) {
      inputs = [inputs];
    } else if (!Array.isArray(inputs)) {
      inputs = [];
    }

    if (!inputs.length) {
      callback(new Error("Module '" + name + "' has not 'inputs' field."), null);

      return;
    }

    for (var i = 0; i < inputs; i++) {
      inputs[i] = path.resolve(this._configFile, inputs[i]);
    }

    rawModules[name] = {
      deps: deps,
      inputs: inputs,
      wrapper: 'string' == typeof wrapper ? wrapper : ''
    };
  }

  callback(null, rawModules);
};

/**
 * @param {function(Error)=} opt_callback First argument is error or null.
 */
ModuleBuilder.prototype.compile = function(opt_callback) {
  this._callback = opt_callback || null;

  if (this._config) {
    this._parseCofig(this._config);
  } else if (this._configFile) {
    ModuleBuilder.readConfigFile(
      this._configFile, this._onConfigFileRead.bind(this));
  } else {
    this._runCallback(new Error('Empty config.'));
  }
};

/**
 * @param {JsModule} rootModule
 * @param {function(Error,*)} callback
 * @private
 */
ModuleBuilder.prototype._compile = function(rootModule, callback) {
  var paths = rootModule.getDeps(true).map(function(jsSource) {
    return jsSource.getPath();
  });

  /** @type {!Array.<JsCompiler.Module>} */
  var modules = this._getModulesInfo(rootModule);

  var jsCompiler = new JsCompiler(this.compilerPath, paths);
  jsCompiler.setMaxBuffer(this.getMaxBuffer());
  jsCompiler.setModules(modules);
  jsCompiler.setModuleOutputPathPrefix(this.outputPathPrefix);
  jsCompiler.setCompilerFlags(this.getAllCompilerFlags());

  if (this._jvmFlags) {
    jsCompiler.setJvmFlags(this._jvmFlags);
  }

  // Will throw an error if the compilation fails.
  jsCompiler.compile(callback);
};

/**
 * @param {Error} err
 * @param {Object} configJson
 * @private
 */
ModuleBuilder.prototype._onConfigFileRead = function(err, configJson) {
  if (err) {
    this._runCallback(err);
  } else {
    this._parseCofig(configJson);
  }
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

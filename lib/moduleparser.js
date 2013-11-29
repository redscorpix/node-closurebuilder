var async = require('async');
var fs = require('fs');
var path = require('path');

var JsModule = require('./jsmodule');
var utils = require('./utils');


/**
 * @param {string} compilerPath
 * @param {Object|string} config JSON or path to file.
 * @param {Array.<string>} jsFiles Files or directories.
 * @param {Cache=} opt_cache
 * @constructor
 */
var ModuleParser = module.exports = function(config, jsFiles, opt_cache) {
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
  /** @type {Cache} */
  this._cache = opt_cache || null;
};


/**
 * @typedef {{
 *  deps: !Array.<string>,
 *  inputs: !Array.<string>,
 *  wrapper: string
 * }}
 */
ModuleParser.RawModule;


/**
 * @param {string} configFile
 * @param {function(Error,Object)} First argument is error or null.
 */
ModuleParser.readConfigFile = function(configFile, callback) {
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
ModuleParser.getJsModule = function(name, parent, rawModules, childsMap,
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
          ModuleParser.getJsModule(
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
    function(jsFiles, callback) {
      utils.findSourcesByJsFiles(jsFiles, this._cache, callback);
    }
  )(rawModule.inputs, callback);
};


/**
 * @type {string}
 */
ModuleParser.prototype.globalScopeName = '';

/**
 * @type {string}
 */
ModuleParser.prototype.outputPathPrefix = '';

/**
 * @type {string}
 */
ModuleParser.prototype.productionUri = '';

/**
 * @type {JsModule}
 */
ModuleParser.prototype.rootModule = null;

/**
 * @type {string}
 */
ModuleParser.prototype.renamePrefixNamespace = 'z';


/**
 * @param {Object} configJson
 * @param {function(Error,Object)} callback
 * @private
 */
ModuleParser.prototype._getGlobalOptions = function(configJson, callback) {
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
    this.outputPathPrefix = path.resolve(
      path.dirname(this._configFile), outputPathPrefix);
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
 * @param {Object.<ModuleParser.RawModule>} rawModules
 * @param {function(Error,JsModule)} callback
 * @private
 */
ModuleParser.prototype._getJsModules = function(rawModules, callback) {
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
    utils.findSourcesByJsFiles(this.jsFiles, this._cache, function(err, jsSources) {
      if (err) {
        callback(err, null);
      } else {
        ModuleParser.getJsModule(
          rootName, null, rawModules, childsMap, jsSources, callback);
      }
    });
  } else {
    callback(new Error('Root module not found.'));
  }
};

/**
 * @return {Object}
 */
ModuleParser.prototype.getJsonModuleInfo = function() {
  if (this.rootModule) {
    return ModuleParser.getJsonModuleInfo(this.rootModule);
  }

  return null;
};

/**
 * @return {Object}
 */
ModuleParser.prototype.getJsonModuleUris = function() {
  if (this.rootModule) {
    return ModuleParser.getJsonModuleUris(this.rootModule, this.productionUri);
  }

  return null;
};

/**
 * @param {JsModule} module
 * @return {Object}
 */
ModuleParser.getJsonModuleInfo = function(module) {
  /** @type {JsModule} */
  var parent = module.getParent();
  var result = {};
  result[module.name] = parent ? [parent.name] : [];

  module.getSubModules().forEach(function(subModule) {
    var subInfo = ModuleParser.getJsonModuleInfo(subModule);

    for (var key in subInfo) {
      result[key] = subInfo[key];
    }
  });

  return result;
};

/**
 * @param {JsModule} module
 * @param {string} webUriPrefix
 * @return {Object}
 */
ModuleParser.getJsonModuleUris = function(module, webUriPrefix) {
  var result = {};
  result[module.name] = webUriPrefix + module.name + '.js';

  module.getSubModules().forEach(function(subModule) {
    var subInfo = ModuleParser.getJsonModuleUris(subModule, webUriPrefix);

    for (var key in subInfo) {
      result[key] = subInfo[key];
    }
  });

  return result;
};

/**
 * @param {Object} json
 * @param {function(Error,Object.<ModuleParser.RawModule>)} callback
 * @private
 */
ModuleParser.prototype._getRawModules = function(json, callback) {
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

    var configDir = path.dirname(this._configFile);

    for (var i = 0; i < inputs; i++) {
      inputs[i] = path.resolve(configDir, inputs[i]);
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
 * @param {JsModule} rootModule
 * @param {function(Error,JsModule)} callback
 * @private
 */
ModuleParser.prototype._buildRootModule = function(rootModule, callback) {
  rootModule.build(function(err) {
    callback(err, rootModule);
  });
};

/**
 * @param {function(Error,JsModule)=} opt_callback
 */
ModuleParser.prototype.parse = function(opt_callback) {
  var callback = opt_callback || function() {};

  if (this.rootModule) {
    callback(null, this.rootModule);
  } else if (this._config || this._configFile) {
    var funcs = [
      this._buildRootModule.bind(this),
      this._getJsModules.bind(this),
      this._getRawModules.bind(this),
      this._getGlobalOptions.bind(this)
    ];
    var startData;

    if (this._config) {
      startData = this._config;
    } else {
      funcs.push(ModuleParser.readConfigFile);
      startData = this._configFile;
    }

    var onParsed = function(err, rootModule) {
      if (err) {
        callback(err, null);
      } else {
        this.rootModule = rootModule;
        callback(null, rootModule);
      }
    };

    async.compose.apply(null, funcs)(startData, onParsed.bind(this));
  } else {
    callback(new Error('Empty config.'), null);
  }
};

var async = require('async');
var path = require('path');

var DepsTree = require('./depstree');


/**
 * @param {string} name
 * @param {JsModule?} parent
 * @param {Array.<Source>} jsSources
 * @param {Array.<Source>} inputSources
 * @constructor
 */
var JsModule = module.exports = function(name, parent, jsSources,
    inputSources) {
  /** @private {Array.<Source>} */
  this._deps = [];
  /** @private {Array.<Source>} */
  this._inputSources = inputSources;
  /** @private {Array.<Source>} */
  this._jsSources = jsSources;
  /** @type {string} */
  this.name = name;
  /** @type {JsModule?} */
  this._parent = parent;
  /** @private {Array.<JsModule>} */
  this._subModules = [];
  /** @private {string|function(ModuleBuilder,JsModule,JsModule=)|null} */
  this._wrapper = null;
};

/**
 * Returns true if the given Source is the Closure base.js source.
 * @param {Source} jsSource
 * @return {boolean}
 */
JsModule.isClosureBaseFile = function(jsSource) {
  return 'base.js' == path.basename(jsSource.path) &&
    jsSource.provides && 'goog' == jsSource.provides[0];
};


/**
 * @param {function(Error,Source)} callback
 * @private
 */
JsModule.prototype._getBaseFileSource = function(callback) {
  /** @type {!Array.<Source>} */
  var baseFileSources = this._jsSources.filter(function(jsSource) {
    return JsModule.isClosureBaseFile(jsSource);
  });

  if (1 == baseFileSources.length) {
    callback(null, baseFileSources[0]);
  } else if (baseFileSources.length) {
    var errorMessage = [
      'More than one Closure base.js files found at these paths:'
    ];

    baseFileSources.forEach(function(baseFile) {
      errorMessage.push(baseFile.path);
    });

    callback(new Error(errorMessage.join('\n')), null);
  } else {
    callback(new Error('No Closure base.js file found.'), null);
  }
};

/**
 * @param {function(Error)} callback
 */
JsModule.prototype.calculateDeps = function(callback) {
  try {
    var tree = new DepsTree(this._jsSources);
    this._deps = this._deps.concat(tree.getDependencies(this._inputSources));

    async.each(this._subModules, function(subModule, callback) {
      subModule.calculateDeps(callback);
    }, function(err) {
      callback(err);
    });
  } catch (e) {
    callback(e);
  }
};

/**
 * @param {boolean=} opt_withSubmodules
 * @return {Array.<Source>}
 */
JsModule.prototype.getDeps = function(opt_withSubmodules) {
  var allDeps = [];

  this._deps.forEach(function(dep) {
    if (-1 == allDeps.indexOf(dep)) {
      allDeps.push(dep);
    }
  });

  if (opt_withSubmodules) {
    this._subModules.forEach(function(subModule) {
      subModule.getDeps(true).forEach(function(subDep) {
        if (-1 == allDeps.indexOf(subDep)) {
          allDeps.push(subDep);
        }
      });
    });
  }

  return allDeps;
};

JsModule.prototype.normalizeDeps = function() {
  /* Берем все депсы у субмодулей и добавляем в конец депсов общие, удаляем их
  из субмодулей. Запускаем тот же процесс у субмодулей.*/

  /** @type {Array.<Array.<Source>>} */
  var subDeps = this._subModules.map(function(subModule) {
    return subModule.getDeps(true);
  });
  var sharingDeps = [];

  for (var i = 0; i < subDeps.length; i++) {
    for (var j = 0; j < subDeps[i].length; j++) {
      var subDep = subDeps[i][j];

      var sharing = -1 < this._deps.indexOf(subDep);

      for (var k = i + 1; k < subDeps.length; k++) {
        var index = subDeps[k].indexOf(subDep);

        if (-1 < index) {
          sharing = true;
          subDeps[k].splice(index, 1);
        }
      }

      if (sharing) {
        sharingDeps.push(subDep);
      }
    }
  }

  sharingDeps.forEach(function(dep) {
    if (-1 == this._deps.indexOf(dep)) {
      this._deps.push(dep);
    }
  }, this);

  this._subModules.forEach(function(subModule) {
    sharingDeps.forEach(function(dep) {
      subModule.removeDep(dep);
    });

    subModule.normalizeDeps();
  });
};

/**
 * @param {Source} dep
 * @return {boolean}
 */
JsModule.prototype.removeDep = function(dep) {
  var removed = false;
  var index = this._deps.indexOf(dep);

  if (-1 < index) {
    removed = true;
    this._deps.splice(index, 1);
  }

  this._subModules.forEach(function(subModule) {
    removed = subModule.removeDep(dep) || removed;
  });

  return removed;
};

/**
 * @return {string}
 */
JsModule.prototype.getModuleFlagValue = function() {
  var name = this.name + ':' + this.getDeps().length;

  if (this._parent) {
    name += ':' + this._parent.name;
  }

  return name;
};

/**
 * @return {JsModule}
 */
JsModule.prototype.getParent = function() {
  return this._parent;
};

/**
 * @param {JsModule} subModule
 */
JsModule.prototype.addSubModule = function(subModule) {
  this._subModules.push(subModule);
};

/**
 * @return {Array.<JsModule>}
 */
JsModule.prototype.getSubModules = function() {
  return this._subModules;
};

/**
 * @return {string|function(ModuleBuilder,JsModule,JsModule=)|null} wrapper
 */
JsModule.prototype.getWrapper = function() {
  return this._wrapper;
};

/**
 * @param {string|function(ModuleBuilder,JsModule,JsModule=)|null} wrapper
 */
JsModule.prototype.setWrapper = function(wrapper) {
  this._wrapper = wrapper;
};

/**
 * @param {function(Error)} callback
 */
JsModule.prototype.build = function(callback) {
  var self = this;

  this._getBaseFileSource(function(err, baseSource) {
    if (err) {
      callback(err);
    } else {
      self._deps.push(baseSource);
      self.calculateDeps.call(self, function(err) {
        if (err) {
          callback(err);
        } else {
          self.normalizeDeps.call(self);
          callback(null);
        }
      });
    }
  });
};

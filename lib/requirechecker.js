var async = require('async');

var jsdocParser = require('./jsdoc_parser');
var time = require('./time');
var utils = require('./utils');


/**
 * @param {Array.<string>} jsFiles
 * @param {Array.<string>=} opt_externFiles
 * @constructor
 */
var RequireChecker = exports.RequireChecker = function(jsFiles,
    opt_externFiles) {
  /** @type {Array.<string>} */
  this.jsFiles = jsFiles;
  /** @type {Array.<string>} */
  this.externFiles = opt_externFiles || [];
  /** @private {Object.<string>} */
  this._jsCache = {};
  /** @private {Object.<string>} */
  this._docCache = {};
};


/**
 * @param {Array.<Object.<type:string,value:string>>} tokens
 * @return {Object.<number>}
 */
RequireChecker.getFileIdsMap = function(tokens) {
  var idsMap = {};
  var id = [];

  tokens.forEach(function(token) {
    if ('Identifier' == token.type) {
      id.push(token.value);
    } else if (
      (
        'Punctuator' != token.type ||
        '.' != token.value
      ) &&
      id.length
    ) {
      var index = id.indexOf('prototype');

      if (-1 < index) {
        id.splice(index, id.length - index);
      }

      var fullId = id.join('.');

      if (!idsMap[fullId]) {
        idsMap[fullId] = 1;
      }

      id = [];
    }
  });

  return idsMap;
};


/**
 * @private {function(Error,Object.<Array.<string>,Object.<Array.<string>>>)?}
 */
RequireChecker.prototype._callback = null;

/**
 * @private {Array.<string>}
 */
RequireChecker.prototype._excludeProvides = null;

/**
 * @private {boolean}
 */
RequireChecker.prototype._logPrint = true;

/**
 * @private {boolean}
 */
RequireChecker.prototype._resultPrint = true;


/**
 * @return {Array.<string>}
 */
RequireChecker.prototype.getExcludeProvides = function() {
  return this._excludeProvides;
};

/**
 * @param {Array.<string>} provides
 */
RequireChecker.prototype.setExcludeProvides = function(provides) {
  this._excludeProvides = provides;
};

/**
 * @return {boolean}
 */
RequireChecker.prototype.isLogPrint = function() {
  return this._logPrint;
};

/**
 * @param {boolean} enable
 */
RequireChecker.prototype.setLogPrint = function(enable) {
  this._logPrint = enable;
};

/**
 * @param {Object.<Array.<string>>} missingRequiresMap
 * @param {Object.<Array.<string>>} unnecessaryRequiresMap
 * @private
 */
RequireChecker.prototype._printResult = function(missingRequiresMap,
    unnecessaryRequiresMap) {
  var missingRequiresInfo = [];
  var unnecessaryRequiresInfo = [];

  for (var path in missingRequiresMap) {
    missingRequiresInfo.push({
      path: path,
      missingRequires: missingRequiresMap[path]
    });
  }

  missingRequiresInfo.sort(function(a, b) {
    return a.path > b.path ? 1 : a.path < b.path ? -1 : 0;
  });

  for (var path in unnecessaryRequiresMap) {
    unnecessaryRequiresInfo.push({
      path: path,
      missingRequires: unnecessaryRequiresMap[path]
    });
  }

  unnecessaryRequiresInfo.sort(function(a, b) {
    return a.path > b.path ? 1 : a.path < b.path ? -1 : 0;
  });

  console.log('Missing requires: ' + missingRequiresInfo.length);

  missingRequiresInfo.forEach(function(item) {
    console.log(item.path);

    item.missingRequires.forEach(function(require) {
      console.log('\t' + require);
    });
  });

  if (missingRequiresInfo.length) {
    console.log('\n');
  }

  console.log('Unnecessary requires: ' + unnecessaryRequiresInfo.length);

  unnecessaryRequiresInfo.forEach(function(item) {
    console.log(item.path);

    item.missingRequires.forEach(function(require) {
      console.log('\t' + require);
    });
  });
};

/**
 * @return {boolean}
 */
RequireChecker.prototype.isResultPrint = function() {
  return this._resultPrint;
};

/**
 * @param {boolean} enable
 */
RequireChecker.prototype.setResultPrint = function(enable) {
  this._resultPrint = enable;
};

/**
 * @param {Source} jsSource
 * @param {Array.<string>} provides
 * @return {!Object}
 */
RequireChecker.prototype.getWrongRequiresInFile = function(jsSource, provides) {
  var usedNamespacesMap = {};
  var jsdocTypesMap = {};
  var map;
  var id;
  var syntaxTree = jsSource.getSyntaxTree();
  var missingRequires = [];
  var unnecessaryRequires = [];

  if (syntaxTree) {
    if (syntaxTree.tokens) {
      usedNamespacesMap = RequireChecker.getFileIdsMap(syntaxTree.tokens);
      map = {};

      for (id in usedNamespacesMap) {
        if (this._jsCache[id]) {
          map[this._jsCache[id]] = 1;
        } else if (undefined === this._jsCache[id]) {
          this._jsCache[id] = null;

          provides.every(function(provide) {
            if (
              0 == id.indexOf(provide) &&
              (
                id.length == provide.length ||
                /[^\w\$]/.test(id[provide.length])
              )
            ) {
              this._jsCache[id] = provide;
              map[provide] = 1;

              return false;
            }

            return true;
          }, this);
        }
      }

      usedNamespacesMap = map;
    }

    if (syntaxTree.comments) {
      syntaxTree.comments.forEach(function(comment) {
        if ('Block' == comment.type && /^\*[^\*]/.test(comment.value)) {
          var jsdocTypes = jsdocParser.getTypes(comment.value);

          jsdocTypes.forEach(function(type) {
            jsdocTypesMap[type] = 1;
          });
        }
      });

      map = {};

      for (id in jsdocTypesMap) {
        if (this._docCache[id]) {
          map[this._docCache[id]] = 1;
        } else if (undefined === this._docCache[id]) {
          this._docCache[id] = null;

          provides.every(function(provide) {
            var escaped = provide.replace('.', '\\.').replace('$', '\\$');
            var regExp = new RegExp(
              '[^A-Za-z0-9_\.\$]' + escaped + '[^A-Za-z0-9_\$]');

            if (
              -1 < (' ' + id + ' ').search(regExp)
            ) {
              this._docCache[id] = provide;
              map[provide] = 1;

              return false;
            }

            return true;
          }, this);
        }
      }

      jsdocTypesMap = map;
    }

    jsSource.requires.forEach(function(require) {
      if (!usedNamespacesMap[require] && !jsdocTypesMap[require]) {
        unnecessaryRequires.push(require);
      }
    });

    var provideRequireMap = {};

    jsSource.provides.concat(jsSource.requires).forEach(function(id) {
      provideRequireMap[id] = 1;
    });

    for (id in usedNamespacesMap) {
      if (!provideRequireMap[id]) {
        missingRequires.push(id);
      }
    }

    missingRequires.sort();
    unnecessaryRequires.sort();
  }

  return {
    missingRequires: missingRequires,
    unnecessaryRequires: unnecessaryRequires
  };
};

/**
 * @param {function(Error,Object.<Array.<string>,Object.<Array.<string>>>)=}
 *    opt_callback
 */
RequireChecker.prototype.getWrongRequires = function(opt_callback) {
  if (opt_callback) {
    this._callback = opt_callback;
  }

  var jsSources;

  time.start(this._logPrint);

  var findExternSources = function(sources, callback) {
    jsSources = sources;

    if (this.externFiles.length) {
      utils.findSourcesByJsFiles(this.externFiles, callback);
    } else {
      callback(null, []);
    }
  };

  var getRequiresMap = function(externSources, callback) {
    time.tick('Search sources by JS files');

    var providesMap = {};
    var provides = [];

    jsSources.concat(externSources).forEach(function(jsSource) {
      jsSource.provides.forEach(function(provide) {
        providesMap[provide] = 1;
      });
    });

    if (this._excludeProvides) {
      this._excludeProvides.forEach(function(provide) {
        if (providesMap[provide]) {
          delete providesMap[provide];
        }
      });
    }

    for (var provide in providesMap) {
      provides.push(provide);
    }

    provides.sort(function(a, b) {
      return a < b ? 1 : a > b ? -1 : 0;
    });

    var missingRequiresMap = {};
    var unnecessaryRequiresMap = {};

    time.tick('Sources found');

    jsSources.forEach(function(jsSource) {
      var info = this.getWrongRequiresInFile(jsSource, provides);
      var missingRequires = info.missingRequires;
      var unnecessaryRequires = info.unnecessaryRequires;

      if (missingRequires.length) {
        missingRequiresMap[jsSource.getPath()] = missingRequires;
      }

      if (unnecessaryRequires.length) {
        unnecessaryRequiresMap[jsSource.getPath()] = unnecessaryRequires;
      }
    }, this);

    time.tick('Wrong requires found.');
    time.total('Total time. Compiling finished.');

    callback(null, {
      missingRequiresMap: missingRequiresMap,
      unnecessaryRequiresMap: unnecessaryRequiresMap
    });
  };

  async.compose(
    getRequiresMap.bind(this),
    findExternSources.bind(this),
    utils.findSourcesByJsFiles
  )(this.jsFiles, this._onFinish.bind(this));
};

/**
 * @param {Error} err
 * @param {{missingRequiresMap:Object.<Array.<string>>,
 *    unnecessaryRequiresMap:Object.<Array.<string>>}} info
 * @private
 */
RequireChecker.prototype._onFinish = function(err, info) {
  if (err) {
    if (this._callback) {
      this._callback(err, null);
    }
  } else {
    if (this._resultPrint) {
      this._printResult(info.missingRequiresMap, info.unnecessaryRequiresMap);
    }

    if (this._callback) {
      this._callback(
        null, info.missingRequiresMap, info.unnecessaryRequiresMap);
    }
  }
};

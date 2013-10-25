/**
 * @param {string} compilerPath
 * @constructor
 */
var BuilderBase = exports.BuilderBase = function(compilerPath) {
  /** @type {string} */
  this.compilerPath = compilerPath;
};


/**
 * @private {number}
 */
BuilderBase.prototype._maxBuffer = 200 * 1024;

/**
 * @private {Array.<string>}
 */
BuilderBase.prototype._compilerFlags = null;

/**
 * @private {Object.<boolean|number|string>}
 */
BuilderBase.prototype._definesMap = null;

/**
 * @private {Array.<string>}
 */
BuilderBase.prototype._externs = null;

/**
 * @private {Array.<string>}
 */
BuilderBase.prototype._jvmFlags = null;


/**
 * @return {!Array.<string>}
 */
BuilderBase.prototype.getAllCompilerFlags = function() {
  var flags = [];

  if (this._definesMap) {
    for (var key in this._definesMap) {
      var value = this._definesMap[key];
      var escapedValue = value;

      if ('string' == typeof escapedValue) {
        escapedValue = "\\'" + escapedValue + "\\'";
      }

      flags.push("--define " + key + "=" + escapedValue);
    }
  }

  if (this._externs) {
    this._externs.forEach(function(extern) {
      flags.push("--externs '" + extern + "'");
    });
  }

  if (this._compilerFlags) {
    flags = flags.concat(this._compilerFlags);
  }

  return flags;
};

/**
 * @return {Array.<string>}
 */
BuilderBase.prototype.getCompilerFlags = function() {
  return this._compilerFlags;
};

/**
 * @param {Array.<string>} flags
 */
BuilderBase.prototype.setCompilerFlags = function(flags) {
  this._compilerFlags = flags;
};

/**
 * @return {Object.<boolean|number|string>}
 */
BuilderBase.prototype.getDefinesMap = function() {
  return this._definesMap;
};

/**
 * @param {Object.<boolean|number|string>} definesMap
 */
BuilderBase.prototype.setDefinesMap = function(definesMap) {
  this._definesMap = definesMap;
};

/**
 * @return {Array.<string>}
 */
BuilderBase.prototype.getExterns = function() {
  return this._externs;
};

/**
 * @param {Array.<string>} externs
 */
BuilderBase.prototype.setExterns = function(externs) {
  this._externs = externs;
};

/**
 * @return {Array.<string>}
 */
BuilderBase.prototype.getJvmFlags = function() {
  return this._jvmFlags;
};

/**
 * @param {Array.<string>} flags
 */
BuilderBase.prototype.setJvmFlags = function(flags) {
  this._jvmFlags = flags;
};

/**
 * @return {number}
 */
BuilderBase.prototype.getMaxBuffer = function() {
  return this._maxBuffer;
};

/**
 * @param {number} maxBuffer
 */
BuilderBase.prototype.setMaxBuffer = function(maxBuffer) {
  this._maxBuffer = maxBuffer;
};

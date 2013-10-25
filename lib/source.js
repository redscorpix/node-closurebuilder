/**
 * Scans a source JS file for its provided and required namespaces.
 *
 * Simple class to scan a JavaScript file and express its dependencies.
 */

var esprima = require('esprima');
var fs = require('fs');


/**
 * Matches a multiline comment.
 * Note: We can't definitively distinguish a "/*" in a string literal without a
 * state machine tokenizer. We'll assume that a line starting with whitespace
 * and "/*" is a comment.
 * @const {RegExp}
 */
var COMMENT_REGEX = new RegExp('/\\*[\\s\\S]*?\\*/', 'gm');

/**
 * Scans a JavaScript source for its provided and required namespaces.
 *
 * @param {string} path Path to a JavaScript file.
 * @param {string} source The JavaScript source.
 * @constructor
 */
var Source = exports.Source = function(path, source) {
  /** @type {!Array.<string>} */
  this.provides = [];
  /** @type {!Array.<string>} */
  this.requires = [];
  /** @private (string) */
  this._path = path;
  /** @private {string} */
  this._source = source;

  this._scanSource();
};

/**
 * @private {Object}
 */
Source.prototype._syntaxTree = null;

/**
 * @return {string}
 */
Source.prototype.toString = function() {
  return 'Source ' + this._path;
};

/**
 * Returns the path.
 * @return {string}
 */
Source.prototype.getPath = function() {
  return this._path;
};

/**
 * Get the source as a string.
 * @return {string}
 */
Source.prototype.getSource = function() {
  return this._source;
};

/**
 * @return {Object}
 */
Source.prototype.getSyntaxTree = function() {
  return this._syntaxTree;
};

/**
 * Determines whether the @provideGoog flag is in a comment.
 * @param {string} source
 * @return {boolean}
 * @private
 */
Source.prototype._hasProvideGoogFlag = function(source) {
  var match;

  while (match = COMMENT_REGEX.exec(source)) {
    if (-1 < match[0].indexOf('@provideGoog')) {
      return true;
    }
  }

  return false;
};

/**
 * Fill in provides and requires by scanning the source.
 * @private
 */
Source.prototype._scanSource = function() {
  try {
    this._syntaxTree = esprima.parse(this._source, {
      comment: true,
      tokens: true
    });

    if (this._syntaxTree) {
      this._syntaxTree.body = null;
    }
  } catch (e) {
    console.log(this._path);

    throw e;
  }

  if (this._syntaxTree.tokens) {
    var tokens = this._syntaxTree.tokens;

    for (var i = 4; i < tokens.length; i++) {
      if (
        'String' == tokens[i].type &&
        'Punctuator' == tokens[i - 1].type && '(' == tokens[i - 1].value &&
        'Identifier' == tokens[i - 2].type &&
        'Punctuator' == tokens[i - 3].type && '.' == tokens[i - 3].value &&
        'Identifier' == tokens[i - 4].type && 'goog' == tokens[i - 4].value
      ) {
        if ('provide' == tokens[i - 2].value) {
          this.provides.push(
            tokens[i].value.substr(1, tokens[i].value.length - 2));
        } else if ('require' == tokens[i - 2].value) {
          this.requires.push(
            tokens[i].value.substr(1, tokens[i].value.length - 2));
        }
      }
    }
  }

  // Closure's base file implicitly provides 'goog'.
  // This is indicated with the @provideGoog flag.
  if (this._hasProvideGoogFlag(this.getSource())) {
    if (this.provides.length || this.requires.length) {
      throw new Error('Base file should not provide or require namespaces.');
    }

    this.provides.push('goog');
  }
};

/**
 * Get a file's contents as a string.
 * @param {string} Path to file.
 * @return {string}
 */
exports.getFileContents = function(path) {
  return fs.readFileSync(path, 'utf8');
};

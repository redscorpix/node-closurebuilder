const esprima = require('esprima');
const fs = require('fs');


/**
 * Scans a JavaScript source for its provided and required namespaces.
 */
class Source {

  /**
   * @param {string} path Path to a JavaScript file.
   * @param {Array<string>} provides
   * @param {Array<string>} requires
   * @param {boolean} isModule
   * @param {Object} syntaxTree
   */
  constructor(path, provides, requires, isModule, syntaxTree) {

    /** @type {boolean} */
    this.isModule = isModule;

    /** @type {!Array<string>} */
    this.provides = provides || [];

    /** @type {!Array<string>} */
    this.requires = requires || [];

    /** @type (string) */
    this.path = path;

    /** @type {Object} */
    this.syntaxTree = syntaxTree;
  }

  /**
   * @param {string} path
   * @param {boolean} opt_saveSyntaxTree
   * @return {!Source}
   */
  static createFromFile(path, opt_saveSyntaxTree) {
    let source;
    let syntaxTree = null;
    let tokens;
    const provides = [];
    const requires = [];
    let isModule = false;

    try {
      source = fs.readFileSync(path, 'utf8');

      if (opt_saveSyntaxTree) {
        syntaxTree = esprima.parse(source, {
          comment: true,
          tokens: true,
        });

        if (syntaxTree) {
          syntaxTree.body = null;
        }
      }

      tokens = esprima.tokenize(source);
    } catch (e) {
      console.error(path);

      throw e;
    }

    if (tokens) {
      let testOnly = false;

      for (let i = 4; i < tokens.length; i++) {
        if ('String' == tokens[i].type &&
            'Punctuator' == tokens[i - 1].type && '(' == tokens[i - 1].value &&
            'Identifier' == tokens[i - 2].type &&
            'Punctuator' == tokens[i - 3].type && '.' == tokens[i - 3].value &&
            'Identifier' == tokens[i - 4].type &&
                'goog' == tokens[i - 4].value &&
            'setTestOnly' == tokens[i - 2].value) {
          testOnly = true;
          break;
        }
      }

      if (!testOnly) {
        for (let i = 4; i < tokens.length; i++) {
          if ('String' == tokens[i].type &&
              'Punctuator' == tokens[i - 1].type &&
                  '(' == tokens[i - 1].value &&
              'Identifier' == tokens[i - 2].type &&
              'Punctuator' == tokens[i - 3].type &&
                  '.' == tokens[i - 3].value &&
              'Identifier' == tokens[i - 4].type &&
                  'goog' == tokens[i - 4].value) {
            if ('provide' == tokens[i - 2].value) {
              provides.push(
                  tokens[i].value.substr(1, tokens[i].value.length - 2));
            } else if ('module' == tokens[i - 2].value) {
              provides.push(
                  tokens[i].value.substr(1, tokens[i].value.length - 2));
              isModule = true;
            } else if ('require' == tokens[i - 2].value) {
              requires.push(
                  tokens[i].value.substr(1, tokens[i].value.length - 2));
            }
          }
        }
      }
    }

    // Closure's base file implicitly provides 'goog'.
    // This is indicated with the @provideGoog flag.
    if (Source.hasProvideGoogFlag(source)) {
      provides.push('goog');
    }

    return new Source(path, provides, requires, isModule, syntaxTree);
  }

  /**
   * Determines whether the @provideGoog flag is in a comment.
   * @param {string} source
   * @return {boolean}
   */
  static hasProvideGoogFlag(source) {
    let match;

    while (match = COMMENT_REGEX.exec(source)) {
      if (-1 < match[0].indexOf('@provideGoog')) {
        return true;
      }
    }

    return false;
  }

  /** @return {string} */
  toString() {
    return 'Source ' + this.path;
  }
}
module.exports = Source;


/**
 * Matches a multiline comment.
 * Note: We can't definitively distinguish a "/*" in a string literal without a
 * state machine tokenizer. We'll assume that a line starting with whitespace
 * and "/*" is a comment.
 * @const {!RegExp}
 */
const COMMENT_REGEX = new RegExp('/\\*[\\s\\S]*?\\*/', 'gm');

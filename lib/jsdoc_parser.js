/**
 * @param {string} str
 * @return {!Array.<string>}
 */
var parseTagTypes = function(str) {
  return str.replace(/[{}]/g, '').trim().split(/ *[|,\/] */);
};

/**
 * @param {string} str
 * @return {!Array.<string>}
 */
var getTypesFromTag = function(str) {
  var parts = str.split(/ +/);
  var dataTypes = [];

  switch (parts[0]) {
    case '@const':
    case '@define':
    case '@extends':
    case '@enum':
    case '@implements':
    case '@lends':
    case '@param':
    case '@private':
    case '@protected':
    case '@return':
    case '@this':
    case '@type':
    case '@typedef':
      dataTypes = parseTagTypes(parts[1] || '');
      break;
  }

  return dataTypes;
};

/**
 * @param {string} jsDoc
 * @return {!Array.<string>}
 */
exports.getTypes = function(jsDoc) {
  var str = jsDoc.replace(/^[ \t]*\* ?/gm, '');
  var types = [];

  if (-1 < str.indexOf('@')) {
    var tags = str.split('@').slice(1);

    tags.forEach(function(tag) {
      types = types.concat(getTypesFromTag('@' + tag.replace(/\s/, ' ')));
    });
  }

  return types;
};



/**
 * @param {string} str
 * @return {!Array.<string>}
 */
const parseTagTypes = str =>
    str.replace(/[{}]/g, '').trim().split(/ *[|,\/] */);

/**
 * @param {string} str
 * @return {!Array<string>}
 */
const getTypesFromTag = str => {
  const parts = str.split(/ +/);

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
      return parseTagTypes(parts[1] || '');
  }

  return [];
};

/**
 * @param {string} jsDoc
 * @return {!Array<string>}
 */
exports.getTypes = jsDoc => {
  const str = jsDoc.replace(/^[ \t]*\* ?/gm, '');
  let types = [];

  if (-1 < str.indexOf('@')) {
    str.split('@').slice(1).forEach(tag => {
      types = types.concat(getTypesFromTag('@' + tag.replace(/\s/, ' ')));
    });
  }

  return types;
};



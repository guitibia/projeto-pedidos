// Title Case pt-BR: sobe a 1ª letra de cada palavra que começa com letra;
// palavras que começam com dígito/símbolo (100ml, 4,0g) ficam minúsculas.
function titleCasePtBr(str) {
  return String(str == null ? '' : str)
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, function (_m, sep, ch) { return sep + ch.toUpperCase(); });
}

// true se há ao menos uma palavra que começa com letra e NENHUMA dessas
// palavras-com-letra contém minúscula (nome "gritando"). Ignora tokens
// que começam com dígito (ex.: "100ml"), então "ABC 100ml" é shouting.
function isShoutingName(str) {
  const words = String(str == null ? '' : str).split(/\s+/).filter(Boolean);
  let hasLetterWord = false;
  for (const w of words) {
    if (/^\p{L}/u.test(w)) {
      hasLetterWord = true;
      if (/\p{Ll}/u.test(w)) return false; // já tem minúscula → não está gritando
    }
  }
  return hasLetterWord;
}

module.exports = { titleCasePtBr, isShoutingName };

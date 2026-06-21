import { TERMINAL_HTTP_URL_MAX_LENGTH } from './terminal-http-link-parser'

// Why: the terminal WebView cannot import TS modules, so it carries the same
// bounded URL parser as the native mobile tap path.
export const HTTP_LINK_PARSER_WEBVIEW_JS = `
  var HTTP_SCHEME_PREFIXES = ['https://', 'http://'];
  var TERMINAL_HTTP_URL_MAX_LENGTH = ${TERMINAL_HTTP_URL_MAX_LENGTH};
  function extractTerminalHttpLinks(lineText) {
    var links = [];
    var searchStart = 0;
    while (searchStart < lineText.length) {
      var startIndex = findNextHttpSchemeIndex(lineText, searchStart);
      if (startIndex === -1) return links;
      if (!hasHttpUrlWordBoundary(lineText, startIndex)) {
        searchStart = startIndex + 1;
        continue;
      }
      var rawEndIndex = findHttpUrlCandidateEnd(lineText, startIndex);
      var endIndex = trimHttpUrlTrailingPunctuation(lineText, startIndex, rawEndIndex);
      searchStart = Math.max(rawEndIndex, startIndex + 1);
      if (endIndex <= startIndex || rawEndIndex - startIndex > TERMINAL_HTTP_URL_MAX_LENGTH) continue;
      var parsed;
      try {
        parsed = new URL(lineText.slice(startIndex, endIndex));
      } catch (e) {
        continue;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      links.push({
        url: parsed.toString(),
        startIndex: startIndex,
        endIndex: endIndex
      });
    }
    return links;
  }
  function findNextHttpSchemeIndex(lineText, searchStart) {
    var nextIndex = -1;
    for (var i = 0; i < HTTP_SCHEME_PREFIXES.length; i++) {
      var candidateIndex = lineText.indexOf(HTTP_SCHEME_PREFIXES[i], searchStart);
      if (candidateIndex !== -1 && (nextIndex === -1 || candidateIndex < nextIndex)) nextIndex = candidateIndex;
    }
    return nextIndex;
  }
  function hasHttpUrlWordBoundary(lineText, startIndex) {
    return startIndex === 0 || !isAsciiWordCode(lineText.charCodeAt(startIndex - 1));
  }
  function findHttpUrlCandidateEnd(lineText, startIndex) {
    var scanEnd = Math.min(lineText.length, startIndex + TERMINAL_HTTP_URL_MAX_LENGTH + 1);
    for (var index = startIndex; index < scanEnd; index += 1) {
      if (isHttpUrlBodyTerminator(lineText.charCodeAt(index))) return index;
    }
    return scanEnd;
  }
  function trimHttpUrlTrailingPunctuation(lineText, startIndex, rawEndIndex) {
    var endIndex = rawEndIndex;
    while (endIndex > startIndex && isHttpUrlTrailingPunctuation(lineText.charCodeAt(endIndex - 1))) endIndex -= 1;
    return endIndex;
  }
  function isHttpUrlBodyTerminator(code) {
    return isAsciiWhitespace(code)
      || code === 0x22
      || code === 0x27
      || code === 0x21
      || code === 0x2a
      || code === 0x28
      || code === 0x29
      || code === 0x7b
      || code === 0x7d
      || code === 0x7c
      || code === 0x5c
      || code === 0x5e
      || code === 0x3c
      || code === 0x3e
      || code === 0x60;
  }
  function isHttpUrlTrailingPunctuation(code) {
    return isAsciiWhitespace(code)
      || code === 0x22
      || code === 0x27
      || code === 0x3a
      || code === 0x2c
      || code === 0x2e
      || code === 0x21
      || code === 0x3f
      || code === 0x7b
      || code === 0x7d
      || code === 0x7c
      || code === 0x5c
      || code === 0x5e
      || code === 0x7e
      || code === 0x5b
      || code === 0x5d
      || code === 0x28
      || code === 0x29
      || code === 0x3c
      || code === 0x3e
      || code === 0x60;
  }
  function isAsciiWhitespace(code) {
    return code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32;
  }
  function isAsciiWordCode(code) {
    return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || code === 95 || (code >= 97 && code <= 122);
  }
`
